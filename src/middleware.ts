import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Routes that require an authenticated user
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/admin"];
// Routes that require an admin role on top of being signed in
const ADMIN_PREFIXES = ["/admin"];

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
  "/m/home",      // seeker-shaped widgets + bookings preview
  "/m/bookings",  // mock data + UI is seeker-perspective only (carer side TBD)
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
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Admin-only routes — verify role on profiles
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
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
        const url = req.nextUrl.clone();
        url.pathname = "/m/jobs";
        url.searchParams.set("forbidden", "role");
        return NextResponse.redirect(url);
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
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
