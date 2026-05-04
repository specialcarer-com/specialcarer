# App Privacy questionnaire — verbatim crib sheet

**App**: Special Carer (Apple ID `6766242271`)
**Owner**: All Care 4 U Group Ltd
**When to use this**: After your first TestFlight build is uploaded, App Store Connect will show a yellow banner saying *"Privacy details required."* Click into it, then go through each section below in order. Every answer here mirrors `mobile/ios-overlay/App/App/PrivacyInfo.xcprivacy` exactly, so the two stay consistent.

> **Important**: Apple now requires the questionnaire match the privacy manifest. If they disagree, App Review will reject the build. If you ever change one, change the other.

---

## Step 1 — "Are you collecting data from this app?"

Answer: **Yes**

Apple will then walk you through a long list of data categories. For each category, tick the boxes shown below.

For the categories not listed in this document, leave them **unticked** (i.e. we don't collect them).

---

## Step 2 — Which data types do you collect?

Tick these 14 boxes:

| Section | Box to tick |
|---|---|
| **Contact Info** | ☑ Name |
| **Contact Info** | ☑ Email Address |
| **Contact Info** | ☑ Phone Number |
| **Contact Info** | ☑ Physical Address |
| **Location** | ☑ Precise Location |
| **Location** | ☑ Coarse Location |
| **Contacts** | ☑ Contacts |
| **Financial Info** | ☑ Payment Info |
| **Sensitive Info** | ☑ Sensitive Info |
| **User Content** | ☑ Photos or Videos |
| **User Content** | ☑ Other User Content |
| **Identifiers** | ☑ Device ID |
| **Usage Data** | ☑ Product Interaction |
| **Diagnostics** | ☑ Crash Data |
| **Diagnostics** | ☑ Performance Data |

Click **Save**. Apple will now ask follow-up questions for each ticked item — the rest of this document gives the verbatim answers.

---

## Step 3 — Per-data-type follow-ups

For every data type, Apple asks the same three questions:

1. **Is the data linked to the user's identity?** — Yes / No
2. **Is the data used for tracking?** — Yes / No (for SpecialCarer, the answer is always **No**)
3. **What's it used for?** — pick one or more purposes

The answers are below. **For every single data type, the "tracking" answer is "No."** Do not tick the tracking box — we do not track users across other companies' apps or websites.

### 1. Name

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality
  - ☑ Customer Support

### 2. Email Address

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality
  - ☑ Customer Support

### 3. Phone Number

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 4. Physical Address

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 5. Precise Location

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 6. Coarse Location

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 7. Contacts

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 8. Payment Info

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 9. Sensitive Info

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 10. Photos or Videos

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 11. Other User Content

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality
  - ☑ Customer Support

### 12. Device ID

- Linked to user? **Yes**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 13. Product Interaction

- Linked to user? **No** *(this is the one exception — analytics is anonymised)*
- Used for tracking? **No**
- Purposes:
  - ☑ Analytics
  - ☑ App Functionality

### 14. Crash Data

- Linked to user? **No**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

### 15. Performance Data

- Linked to user? **No**
- Used for tracking? **No**
- Purposes:
  - ☑ App Functionality

---

## Step 4 — Final review screen

Apple shows a summary of what you've declared. Sanity-check:

- **Data Linked to You**: 12 items (Name, Email, Phone, Physical Address, Precise Location, Coarse Location, Contacts, Payment Info, Sensitive Info, Photos/Videos, Other User Content, Device ID)
- **Data Not Linked to You**: 3 items (Product Interaction, Crash Data, Performance Data)
- **Data Used to Track You**: **0 items** — this section should be empty

If "Data Used to Track You" is non-empty, go back and untick the tracking box on every data type — we do not track.

Click **Publish** to save the questionnaire.

---

## Why each item is collected — for your own reference

If Apple ever queries any of these in App Review, here are the one-line justifications:

| Data | Why we collect it |
|---|---|
| Name | Account creation; shown to the other party in a booking |
| Email | Login, notifications, password reset, customer support |
| Phone | Booking confirmations, SOS contact during a shift |
| Physical Address | Matching the family with caregivers within travel radius |
| Precise Location | Live shift tracking via Mapbox during an active booking |
| Coarse Location | Carer search results sorted by distance |
| Contacts | Optional; only when the user explicitly invites a friend |
| Payment Info | Stripe-hosted; we store only Stripe customer/account IDs |
| Sensitive Info | Government ID for caregiver background checks (uCheck UK / Checkr US) |
| Photos / Videos | Profile photo + ID document upload |
| Other User Content | In-app booking messages between family and caregiver |
| Device ID | APNs push token for booking-status notifications |
| Product Interaction | Anonymous funnel/usage analytics |
| Crash Data | App stability diagnostics |
| Performance Data | App performance diagnostics |

---

## Things to avoid (would force re-review)

- **Don't tick Marketing or Advertising** as a purpose for anything — we don't use data for marketing
- **Don't tick "Used for Tracking"** — even for analytics
- **Don't add Health & Fitness data** — even though the app supports elderly care, we don't store medical records
- **Don't tick Browsing History or Search History** — we don't collect them

If you ever start using a third-party SDK that contradicts this (e.g. an ad network, a marketing automation tool), the questionnaire **must** be updated and the privacy manifest re-shipped.
