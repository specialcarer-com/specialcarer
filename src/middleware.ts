import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { LOCALE_COOKIE } from "@/i18n/config";
import { resolveLocale } from "@/i18n/resolve-locale";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Routes that require an authenticated user
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/admin"];
// Routes that require an admin role on top of being signed in
// Admin login — unauthenticated visitors must reach OTP sign-in.
const ADMIN_LOGIN_PREFIX = "/admin/login";
// Admin MFA setup/challenge — authenticated admins only; AAL2 not required yet.
const ADMIN_MFA_PREFIX = "/admin/mfa";
// Sign-in MFA step-up — requires a session but not AAL2 yet.
const MFA_CHALLENGE_PREFIXES = ["/sign-in/2fa"];

// Mobile app role isolation. Each user's account is permanently bound to a
// role at sign-up; carers and care receivers must not be able to access each
// other's pages even by typing the URL.
//
//   SEEKER_ONLY  — only role==="seeker" may access (carers redirected to /m/jobs)
//   CAREGIVER_ONLY — only role==="caregiver" may access (seekers redirected to /m/search)
//
// Anything not listed here is shared (auth flows, profile, chat,
// notifications, track).
const MOBILE_SEEKER_ONLY_PREFIXES = [
  // /m/home now branches by role server-side (seeker vs carer dashboard)
  // so it is intentionally NOT in this list.
  "/m/bookings",  // mock data + UI is seeker-perspective only (carer side TBD)
  "/m/review",    // seekers write reviews of carers (PR-R4 Review hub)
  "/m/search",
  "/m/book",
  "/m/post-job",
  "/m/household",
  "/m/family",
  "/m/journal",
  "/m/memberships",
  "/m/carer", // browsing carer profiles
];
const MOBILE_CAREGIVER_ONLY_PREFIXES = [
  "/m/jobs",
  "/m/schedule",  // carer-side availability + time-off + recurring clients
  "/m/earnings",  // carer payout dashboard
];

export async function middleware(req: NextRequest) {
  // Expose the resolved pathname to server components via a request header.
  // The /admin layout reads this to skip its requireAdmin() gate on the
  // public /admin/login page. Set on the request (not response) so server
  // components can read it through headers(), and set before createServerClient
  // so it survives the NextResponse.next() rebuild inside the cookie setAll().
  req.headers.set("x-pathname", req.nextUrl.pathname);
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) =>
            req.cookies.set(name, value)
          );
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not place any logic between createServerClient and getUser
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  const isAdminLogin = pathname.startsWith(ADMIN_LOGIN_PREFIX);
  const isAdminMfa = pathname.startsWith(ADMIN_MFA_PREFIX);
  const isMfaChallenge = MFA_CHALLENGE_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  const needsAuth =
    isMfaChallenge ||
    isAdminMfa ||
    (!isAdminLogin &&
      PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)));

  if (needsAuth && !user) {
    const url = req.nextUrl.clone();
    url.pathname = isAdminMfa ? "/admin/login" : "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Admin-only routes — verify role on profiles (includes /admin/mfa/*)
  const isAdminRoute = pathname.startsWith("/admin") && !isAdminLogin;
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
  }

  // Mobile role isolation — carers and care receivers cannot access each
  // other's pages. Skips when user is unauthenticated (let the page handle
  // redirecting to /m/login) or when the path is in the shared set.
  const isSeekerOnly = MOBILE_SEEKER_ONLY_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  const isCaregiverOnly = MOBILE_CAREGIVER_ONLY_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );
  if (user && (isSeekerOnly || isCaregiverOnly)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = profile?.role ?? "seeker";

    // Admins can browse anywhere on /m/* for support purposes.
    if (role !== "admin") {
      if (isSeekerOnly && role === "caregiver") {
        // Carers may preview THEIR OWN public profile via the Profile page's
        // "Preview public profile" button. The path is /m/carer/<userId>?preview=1.
        // Allow that single case through; everything else stays blocked.
        const carerProfileMatch = pathname.match(/^\/m\/carer\/([^\/]+)/);
        const isOwnProfilePreview =
          !!carerProfileMatch && carerProfileMatch[1] === user.id;
        if (!isOwnProfilePreview) {
          const url = req.nextUrl.clone();
          url.pathname = "/m/jobs";
          url.searchParams.set("forbidden", "role");
          return NextResponse.redirect(url);
        }
      }
      if (isCaregiverOnly && role === "seeker") {
        const url = req.nextUrl.clone();
        url.pathname = "/m/search";
        url.searchParams.set("forbidden", "role");
        return NextResponse.redirect(url);
      }
    }
  }

  // If user is on /login but already signed in, send them onward
  if (pathname === "/login" && user) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Seed the NEXT_LOCALE cookie so the resolved UI locale is stable across
  // requests and readable client-side. We deliberately keep this cheap — no
  // extra DB call here. The authoritative profile-wins resolution happens in
  // src/i18n/request.ts (which does its own getUser); middleware only ensures
  // anonymous visitors get a cookie derived from their existing cookie or the
  // Accept-Language header.
  const existingLocale = req.cookies.get(LOCALE_COOKIE)?.value ?? null;
  const resolvedLocale = resolveLocale({
    cookieLocale: existingLocale,
    acceptLanguage: req.headers.get("accept-language"),
  });
  if (existingLocale !== resolvedLocale) {
    res.cookies.set(LOCALE_COOKIE, resolvedLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return res;
}

export const config = {
  matcher: [
    // Run on everything except:
    //   - Next internals (_next/static, _next/image)
    //   - Static assets (svg/png/jpg/jpeg/gif/webp/favicon)
    //   - API routes (each handler does its own auth via createClient — running
    //     middleware here triggered Supabase auth.getUser() on every API call,
    //     adding 10-30s of cold-start latency and 278 MB of memory per invocation)
    //   - /.well-known/* (Apple Pay domain verification, etc — must be served
    //     byte-exact without auth touching the request)
    "/((?!api/|_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
