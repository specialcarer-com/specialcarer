# Homepage "Beta is live" — Draft

This is the **State B** revision of the homepage *Download the App* section,
to be deployed once Build #4 (or whichever build) lands in TestFlight and the
external/public TestFlight invite link is available.

It swaps three things vs. the current State A ("Coming soon") section in
`src/app/page.tsx` (lines 775–880):

1. **New eyebrow pill above the heading** — animated dot + "Beta is live".
2. **App Store badge becomes a real link** — points to the public TestFlight
   invite URL (set `NEXT_PUBLIC_TESTFLIGHT_URL` in env).
3. **Footer microcopy** — "Want to be among the first…" becomes "iOS beta is
   open now" with the same `/contact?subject=app-beta` fallback for users on
   Android (still pre-launch on Play).

Google Play badge stays "Coming soon" until the Android build is ready.

---

## Variables to set before deploy

| env var | Where to get it |
|---|---|
| `NEXT_PUBLIC_TESTFLIGHT_URL` | App Store Connect → TestFlight → SpecialCarer Internal group → "Public Link" toggle (turn ON) → copy the `https://testflight.apple.com/join/...` URL. |

If `NEXT_PUBLIC_TESTFLIGHT_URL` is **not set**, the badge gracefully falls back
to the disabled "Coming soon" appearance — so this code is safe to merge any
time.

---

## Drop-in JSX — replace lines 775–872 of `src/app/page.tsx`

```tsx
{/* Download the App */}
<section className="px-6 py-20 bg-white">
  <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
    {/* Copy + store badges */}
    <div className="order-2 lg:order-1">
      {/* Beta is live eyebrow */}
      {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
        <span
          className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-200"
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
          </span>
          Beta is live
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200">
          Coming soon
        </span>
      )}

      <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
        Download the App
      </h2>

      <p className="mt-5 text-lg text-slate-700 leading-relaxed">
        <span className="font-semibold text-slate-900">
          Special Carer connects you with trusted, verified caregivers
          who offer reliable and heartfelt support.
        </span>{" "}
        We make care simple, safe, and deeply meaningful—built on trust
        and genuine connection.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {/* App Store — live TestFlight link if configured, else Coming soon */}
        {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
          <a
            href={process.env.NEXT_PUBLIC_TESTFLIGHT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-3 text-white shadow-sm hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            aria-label="Join the TestFlight beta on iOS"
          >
            <svg
              viewBox="0 0 384 512"
              aria-hidden="true"
              className="h-7 w-7 fill-white"
            >
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
            </svg>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-wider opacity-80">
                Join the iOS beta on
              </span>
              <span className="block text-lg font-semibold">TestFlight</span>
            </span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-3 text-white shadow-sm cursor-not-allowed opacity-90"
            aria-label="App Store — coming soon"
          >
            <svg viewBox="0 0 384 512" aria-hidden="true" className="h-7 w-7 fill-white">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
            </svg>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-wider opacity-80">Coming soon on the</span>
              <span className="block text-lg font-semibold">App Store</span>
            </span>
          </button>
        )}

        {/* Google Play — still Coming soon */}
        <button
          type="button"
          disabled
          className="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-3 text-white shadow-sm cursor-not-allowed opacity-90"
          aria-label="Get it on Google Play — coming soon"
        >
          <svg viewBox="0 0 512 512" aria-hidden="true" className="h-7 w-7">
            <path fill="#039EA0" d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1z" />
            <path fill="#039EA0" opacity="0.85" d="m104.6 499 220.7-221.3 60.1 60.1L104.6 499z" />
            <path fill="#039EA0" opacity="0.7" d="m484 256-98.6 56.6-65.4-65.4 65.4-65.4z" />
            <path fill="#039EA0" opacity="0.55" d="M104.6 13c-7.4 4.3-12.4 12.7-12.4 23.6v440c0 10.9 5 19.3 12.4 23.6L325.3 277.7l-60.1-60.1z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wider opacity-80">Coming soon to</span>
            <span className="block text-lg font-semibold">Google Play</span>
          </span>
        </button>
      </div>

      {/* Footer microcopy */}
      {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
        <p className="mt-5 text-sm text-slate-500">
          The iOS beta is open now via TestFlight. On Android?{" "}
          <Link
            href="/contact?subject=app-beta"
            className="text-brand-700 hover:underline font-medium"
          >
            Get notified when the Android beta opens
          </Link>
          .
        </p>
      ) : (
        <p className="mt-5 text-sm text-slate-500">
          Want to be among the first to try the app?{" "}
          <Link
            href="/contact?subject=app-beta"
            className="text-brand-700 hover:underline font-medium"
          >
            Join the beta
          </Link>
          .
        </p>
      )}
    </div>

    {/* Phone mockup — unchanged from State A */}
```

---

## Optional: site-wide announcement banner

If you also want a thin **strip across the top of every page** when the beta
goes live, add this above the existing `<TopNav />` in `src/app/layout.tsx`:

```tsx
{process.env.NEXT_PUBLIC_TESTFLIGHT_URL && (
  <div className="bg-brand-600 text-white text-sm">
    <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center">
      <span className="inline-flex items-center gap-2">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        <span className="font-semibold">Beta is live on iOS.</span>
      </span>
      <a
        href={process.env.NEXT_PUBLIC_TESTFLIGHT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-white/60 underline-offset-2 hover:decoration-white"
      >
        Join via TestFlight →
      </a>
    </div>
  </div>
)}
```

This banner is **environment-gated** — it disappears automatically if the env
var is unset, so it's safe to ship now and "turn on" later by setting the var
in Vercel.

---

## Copy variants (in case you'd like a softer tone)

The eyebrow pill text — pick one:

1. **Beta is live** *(default — clear, urgent)*
2. **iOS beta now open** *(more descriptive)*
3. **Now in TestFlight** *(insider-y)*
4. **Try the early app** *(warmer)*

The site-wide banner — pick one:

1. **Beta is live on iOS. Join via TestFlight →**
2. **iOS app now in beta. Be one of the first to try it →**
3. **Special Carer is now in your pocket. Open the iOS beta →**

---

## Rollout sequence

1. **Now:** merge this draft (env-gated, ships as State A — no visible change).
2. **When build #4 (or successor) lands in TestFlight:**
   - In App Store Connect → TestFlight → SpecialCarer Internal → enable "Public Link".
   - Copy the URL.
   - In Vercel → specialcarer project → Settings → Environment Variables, add
     `NEXT_PUBLIC_TESTFLIGHT_URL` = the URL, scope **Production**.
   - Trigger a Vercel redeploy (or wait for next push).
3. **Site automatically flips** to "Beta is live" everywhere it's used.

No code change needed at flip time — just the env var.

---

## Brand notes
- Pulse dot uses `bg-brand-500` / `bg-brand-600` (#039EA0 family) on the
  section eyebrow, white on the top banner.
- "Coming soon" fallback uses neutral slate, never red/yellow — keeps the
  pre-launch state quiet rather than apologetic.
- TestFlight badge keeps the same slate-900 background as State A so the
  visual rhythm of the row is preserved.
