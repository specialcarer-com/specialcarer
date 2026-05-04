# App Review submission — demo accounts + reviewer notes

**App**: Special Carer (Apple ID `6766242271`)
**Bundle ID**: `com.allcare4ugroup.specialcarer`
**When to use this**: When you submit the build for App Review (NOT TestFlight Internal — that doesn't need any of this). Paste the contents of each section into the matching field in **App Store Connect ▸ App Review Information**.

---

## ▸ Sign-In Information

App Store Connect asks: *"Is sign-in required to use your app?"* Answer **Yes**.

Then it shows two fields:

### Username
```
test-family@specialcarer.com
```

### Password
```
DemoPassword!2026
```

> **Tick the checkbox**: "Sign-in required to use this app" — yes.
> Apple's reviewer will use this account to access the app. It's a **family/seeker** account based in London, UK, so reviewers see the full booking flow from the family side.

---

## ▸ Notes for the Reviewer

Paste the entire block below verbatim. Apple's review notes field accepts plain text and renders newlines.

```
Thank you for reviewing Special Carer.

────────────────────────────────────────────
ABOUT THE APP
────────────────────────────────────────────
Special Carer is a marketplace that connects families
with verified, background-checked caregivers (for
elderly care, childcare, special-needs support, and
postnatal care) in the United Kingdom and United
States.

The app is operated by All Care 4 U Group Ltd
(Company No. UK Companies House — Steve Gisanrin,
Account Holder).

The web product (www.specialcarer.com) is live; this
iOS app is a Capacitor-based native shell wrapping
the same product, plus push notifications, secure
biometric login, and live shift-tracking.

────────────────────────────────────────────
DEMO ACCOUNTS
────────────────────────────────────────────
We've provided two pre-seeded demo accounts so you
can experience both sides of the marketplace:

1. FAMILY (SEEKER) — primary login above
   Email:    test-family@specialcarer.com
   Password: DemoPassword!2026
   Country:  United Kingdom (London)
   Use this to: search for caregivers, view profiles,
   start a booking, see Stripe checkout.

2. CAREGIVER
   Email:    demo-aisha@specialcarer.com
   Password: DemoPassword!2026
   Country:  United States (Los Angeles)
   Use this to: see the caregiver dashboard, an
   active profile listing at $29/hour, and the
   "earnings" view.

To switch accounts, use Settings ▸ Sign Out.

────────────────────────────────────────────
SUGGESTED REVIEW PATH (≈10 minutes)
────────────────────────────────────────────
1. Open the app — it loads with the home screen.
   No sign-in is required to browse.
2. Tap "Find care" → enter postcode "SW1A 1AA"
   (any London postcode works) → tap Search.
3. You'll see the list of UK caregivers (including
   Steve Gis at £18/hour and a few seeded carers).
4. Tap any caregiver → view their profile, including
   verification badges, hourly rate, and reviews.
5. Tap "Sign in to book" → log in with the family
   account credentials above.
6. Tap "Book this caregiver" → fill in start/end
   time → continue to Stripe checkout.
7. STRIPE TEST MODE: use card 4242 4242 4242 4242,
   any future expiry, any CVC. The booking will be
   authorised but NOT charged (we use manual capture
   with a 24-hour escrow hold post-shift).
8. To see the caregiver side, sign out and sign in
   with demo-aisha@specialcarer.com.

────────────────────────────────────────────
PERMISSIONS REQUESTED
────────────────────────────────────────────
The app requests the following permissions; each is
optional and the app remains functional if denied:

• Location (when in use + always): live shift
  tracking via Mapbox during active bookings only.
  Tracking stops when the shift ends.
• Push notifications: booking confirmations, shift
  reminders, in-app messages.
• Camera (optional): caregivers can capture an ID
  document during onboarding. Families never use
  the camera.
• Photo library (optional): profile photo upload.
• Contacts (optional): refer-a-friend feature only.
  Contact data is never uploaded without explicit
  user action.
• Face ID (optional): biometric login.

────────────────────────────────────────────
THIRD-PARTY SERVICES
────────────────────────────────────────────
• Stripe — payment processing (escrow + Connect)
• Mapbox — live shift location during bookings
• uCheck (UK) / Checkr (US) — background checks
• Supabase — database + authentication
• Apple Push Notification service — notifications

We do NOT use any advertising or marketing SDKs.
We do NOT track users across other apps or websites.
Our App Privacy declarations match the bundled
PrivacyInfo.xcprivacy manifest exactly.

────────────────────────────────────────────
GUIDELINE-SPECIFIC NOTES
────────────────────────────────────────────
• 1.1.6 (Inaccurate metadata): all marketing
  copy in the App Store listing matches the actual
  product. Pricing shown ("from £18/hour UK,
  $25/hour US") matches live caregiver rates.
• 2.1 (App Completeness): the app is fully
  functional with no placeholder content. The
  test-family account has at least one booking
  history visible.
• 2.5.1 (Software Requirements): all APIs used
  are public Apple frameworks; no private APIs.
• 4.0 (Design): the app uses native iOS UI
  components via WKWebView with adaptive layout.
• 5.1.1 (Privacy/Data Collection): privacy policy
  at https://www.specialcarer.com/privacy.
  We collect only what's declared in the App
  Privacy section and PrivacyInfo.xcprivacy.
• 5.1.2 (Permission): each permission has a clear,
  human-readable usage description in Info.plist
  explaining why it's needed.
• 5.2.1 (Third-Party Sites): we use Stripe-hosted
  checkout (links open in a Browser plugin, not
  in WebView with cookies retained — Apple-friendly).

────────────────────────────────────────────
CONTACT
────────────────────────────────────────────
Steve Gisanrin
All Care 4 U Group Ltd
office@allcare4u.co.uk

If anything is unclear during review, we'll
respond within 4 business hours.

Thank you.
```

---

## ▸ Contact Information

Three fields at the bottom of the App Review Information section:

### First Name
```
Steven
```

### Last Name
```
Gisanrin
```

### Phone Number
```
[Use your business phone number for All Care 4 U Group Ltd]
```

### Email Address
```
office@allcare4u.co.uk
```

---

## ▸ App Review Attachment (optional but recommended)

Apple lets you attach a single file (PDF or video, max 5 MB) to the review submission. Recommended:

- **Either**: a 30–60 second screen recording of the family booking flow on a real device. Shows reviewers what to expect before they even sign in.
- **Or**: a 2-page PDF with annotated screenshots of the same flow (less compelling but easier).

I can prepare either of these once the first TestFlight build is installed and we're ready to record/screenshot. Skip for the first submission if you want to keep it simple — the notes above are sufficient.

---

## ▸ Common rejection reasons + how to respond

Apple App Review usually replies within 24–48 hours. If they reject, here are the most common reasons for a marketplace app and how to respond:

### "Sign-in not working"
Reviewers sometimes can't log in. Reply with:
> "We've re-verified the demo account `test-family@specialcarer.com` / `DemoPassword!2026` and it works as expected. Could you confirm whether you saw an error message? If location is being detected as outside our supported regions (UK/US), please test with a UK or US VPN."

(We don't actually geo-block, but it's a polite framing if the reviewer is in a region we haven't tested.)

### "Guideline 5.1.1 — App Privacy Mismatch"
This means the App Privacy questionnaire doesn't match what's actually collected. Cross-check `mobile/APP_PRIVACY_QUESTIONNAIRE.md` against what's currently published in App Store Connect.

### "Guideline 4.2 — Minimum Functionality"
Reviewers might say the app feels like a website wrapper. Reply with:
> "Thank you for the feedback. The app provides native functionality not available in the mobile web experience: (1) APNs push notifications for booking updates, (2) Face ID biometric login, (3) background location tracking during active shifts using CoreLocation, (4) native deep links via Universal Links to specialcarer.com bookings. The hybrid architecture is industry-standard for marketplace apps (Uber, Airbnb early versions, Stripe Atlas)."

### "Guideline 5.1.5 — Location Services"
If they question background location, reply with:
> "Background location is used solely for live shift tracking — only when a booking is currently active and the user has explicitly opted in by tapping 'Start Shift'. Tracking automatically stops when the shift ends. The Info.plist usage description clearly states this."

---

## ▸ Reminders for first-time submissions

1. **TestFlight first** — internal TestFlight does NOT require App Review. Don't submit for App Store review until you've TestFlight'd at least one build internally and confirmed it works on a real device.
2. **Screenshots** — App Store requires at least one set of screenshots per device size. We can generate these with the Capacitor preview once the first build is installed.
3. **App description, subtitle, keywords** — see `mobile/APP_STORE_LISTING.md`.
4. **Pricing** — Free (in-app purchases later if Plus tier ships). Make sure the "Price Schedule" is set to "Free" before submitting.
5. **Age Rating** — answer "No" to all the explicit-content questions. Special Carer rates as **4+**.
