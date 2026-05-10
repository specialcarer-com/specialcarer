// scripts/seed-test-users.mjs
//
// Idempotent test-user seeder. Creates one well-known account per role:
//   • Family / Care seeker — book carers, browse, message
//   • Caregiver (UK)
//   • Caregiver (US)
//   • Organisation admin — has both a seeker-style profile + an org row
//   • Platform admin
//
// All accounts use the same password so the team can swap freely.
// Re-running this script is safe: existing rows are upserted, not duplicated.
//
// Run with: node scripts/seed-test-users.mjs
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dependency needed).
const envPath = resolve(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SHARED_PASSWORD = "TestPass123!";

const TEST_USERS = [
  {
    label: "Care Seeker (Family)",
    email: "test.family@specialcarer.com",
    password: SHARED_PASSWORD,
    full_name: "Olivia Carter",
    role: "seeker",
    country: "GB",
    locale: "en-GB",
    phone: "+447700900001",
    avatar_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
  },
  {
    label: "Caregiver (UK)",
    email: "test.carer.uk@specialcarer.com",
    password: SHARED_PASSWORD,
    full_name: "Priya Sharma",
    role: "caregiver",
    country: "GB",
    locale: "en-GB",
    phone: "+447700900002",
    avatar_url: "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400&q=80",
    caregiver: {
      headline: "Compassionate elderly carer with 8+ years of experience",
      bio: "I am a fully qualified carer specialising in elderly care, dementia support, and post-operative recovery. I hold an enhanced DBS, NVQ Level 3 in Health & Social Care, and have completed dementia and end-of-life care training. I am known for being patient, reliable, and treating every client with the dignity they deserve. Outside of work I love gardening and walks with my Labrador.",
      city: "Manchester",
      country: "GB",
      postcode: "M1 1AE",
      currency: "GBP",
      hourly_rate_cents: 2200,
      weekly_rate_cents: 95000,
      services: ["elderly_care", "complex_care", "postnatal"],
      care_formats: ["visiting", "live_in"],
      languages: ["English", "Hindi", "Punjabi"],
      certifications: [
        "Enhanced DBS check",
        "NVQ Level 3 in Health & Social Care",
        "Dementia Care certified",
        "First Aid + CPR",
      ],
      tags: ["dementia_specialist", "verified_carer"],
      years_experience: 8,
      rating_avg: 4.8,
      rating_count: 23,
      has_drivers_license: true,
      has_own_vehicle: true,
      gender: "female",
      hide_precise_location: false,
      photo_url: "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=600&q=80",
      is_published: true,
      availability: [
        // weekday: 0=Sun..6=Sat. Mon-Fri 09:00-17:00, Sat 10:00-14:00
        { weekday: 1, start_time: "09:00:00", end_time: "17:00:00" },
        { weekday: 2, start_time: "09:00:00", end_time: "17:00:00" },
        { weekday: 3, start_time: "09:00:00", end_time: "17:00:00" },
        { weekday: 4, start_time: "09:00:00", end_time: "17:00:00" },
        { weekday: 5, start_time: "09:00:00", end_time: "17:00:00" },
        { weekday: 6, start_time: "10:00:00", end_time: "14:00:00" },
      ],
    },
  },
  {
    label: "Caregiver (US)",
    email: "test.carer.us@specialcarer.com",
    password: SHARED_PASSWORD,
    full_name: "Marcus Johnson",
    role: "caregiver",
    country: "US",
    locale: "en-US",
    phone: "+12125550182",
    avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    caregiver: {
      headline: "CNA + HHA — overnight & complex-care specialist",
      bio: "Certified Nursing Assistant (CNA) and Home Health Aide (HHA) with 6 years of hands-on experience supporting families across NYC. I cover overnight shifts, post-surgical recovery, and complex medical needs. I am a calm presence in difficult moments and pride myself on clear communication with families.",
      city: "Brooklyn",
      country: "US",
      postcode: "11201",
      currency: "USD",
      hourly_rate_cents: 3200,
      weekly_rate_cents: 140000,
      services: ["complex_care", "elderly_care", "special_needs"],
      care_formats: ["visiting"],
      languages: ["English", "Spanish"],
      certifications: [
        "Certified Nursing Assistant (CNA)",
        "Home Health Aide (HHA)",
        "BLS / CPR",
        "Background check cleared",
      ],
      tags: ["clinical", "verified_carer", "quick_responder"],
      years_experience: 6,
      rating_avg: 4.9,
      rating_count: 31,
      has_drivers_license: true,
      has_own_vehicle: false,
      gender: "male",
      hide_precise_location: false,
      photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80",
      is_published: true,
      availability: [
        // Tue/Thu/Sat overnight
        { weekday: 2, start_time: "20:00:00", end_time: "23:59:00" },
        { weekday: 4, start_time: "20:00:00", end_time: "23:59:00" },
        { weekday: 6, start_time: "20:00:00", end_time: "23:59:00" },
      ],
    },
  },
  {
    label: "Organisation Admin",
    email: "test.org@specialcarer.com",
    password: SHARED_PASSWORD,
    full_name: "Riverside Care Agency",
    role: "seeker", // org admins are stored as seekers + linked via organization_members
    country: "GB",
    locale: "en-GB",
    phone: "+441612000000",
    avatar_url: null,
    organization: {
      legal_name: "Riverside Care Agency Ltd",
      trading_name: "Riverside Care",
      country: "GB",
      org_type: "domiciliary_agency",
      purpose: "book_for_clients",
      companies_house_number: "12345678",
      vat_number: "GB123456789",
      year_established: 2018,
      size_band: "11-50",
      website: "https://riversidecare.example.co.uk",
      cqc_number: "1-1234567890",
      verification_status: "verified",
      booking_enabled: true,
    },
  },
  {
    label: "Platform Admin",
    email: "test.admin@specialcarer.com",
    password: SHARED_PASSWORD,
    full_name: "Test Admin",
    role: "admin",
    country: "GB",
    locale: "en-GB",
    phone: "+441612000001",
    avatar_url: null,
  },
];

async function ensureUser(u) {
  // Try create. If email exists, fetch and update password instead.
  let userId;
  const { data: created, error: createErr } = await supa.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.full_name, test: true },
  });

  if (createErr) {
    if (
      String(createErr.message || "").toLowerCase().includes("already") ||
      String(createErr.code || "").toLowerCase().includes("registered")
    ) {
      // Look up by listing — Supabase admin doesn't have a direct getByEmail.
      const { data: list } = await supa.auth.admin.listUsers({ perPage: 200 });
      const existing = list?.users?.find((x) => x.email === u.email);
      if (!existing) throw new Error("User exists but could not be located: " + u.email);
      userId = existing.id;
      // Reset password so we always know the credential.
      await supa.auth.admin.updateUserById(userId, {
        password: u.password,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata || {}), full_name: u.full_name, test: true },
      });
    } else {
      throw createErr;
    }
  } else {
    userId = created.user.id;
  }

  // Upsert into profiles
  const { error: profErr } = await supa.from("profiles").upsert(
    {
      id: userId,
      role: u.role,
      full_name: u.full_name,
      phone: u.phone ?? null,
      locale: u.locale ?? "en-GB",
      country: u.country ?? "GB",
      avatar_url: u.avatar_url ?? null,
    },
    { onConflict: "id" },
  );
  if (profErr) throw new Error(`profiles upsert failed for ${u.email}: ${profErr.message}`);

  // If caregiver, upsert caregiver_profiles + availability
  if (u.caregiver) {
    const cg = u.caregiver;
    const { error: cgErr } = await supa.from("caregiver_profiles").upsert(
      {
        user_id: userId,
        display_name: u.full_name,
        headline: cg.headline,
        bio: cg.bio,
        photo_url: cg.photo_url,
        city: cg.city,
        country: cg.country,
        postcode: cg.postcode,
        hide_precise_location: cg.hide_precise_location ?? false,
        services: cg.services,
        care_formats: cg.care_formats,
        languages: cg.languages,
        certifications: cg.certifications,
        tags: cg.tags ?? [],
        hourly_rate_cents: cg.hourly_rate_cents,
        weekly_rate_cents: cg.weekly_rate_cents,
        currency: cg.currency,
        years_experience: cg.years_experience,
        rating_avg: cg.rating_avg,
        rating_count: cg.rating_count,
        has_drivers_license: cg.has_drivers_license,
        has_own_vehicle: cg.has_own_vehicle,
        gender: cg.gender,
        is_published: cg.is_published,
      },
      { onConflict: "user_id" },
    );
    if (cgErr) throw new Error(`caregiver_profiles upsert failed for ${u.email}: ${cgErr.message}`);

    // Replace availability slots cleanly
    if (Array.isArray(cg.availability)) {
      await supa.from("caregiver_availability_slots").delete().eq("user_id", userId);
      const rows = cg.availability.map((s) => ({
        user_id: userId,
        weekday: s.weekday,
        start_time: s.start_time,
        end_time: s.end_time,
      }));
      if (rows.length) {
        const { error: avErr } = await supa.from("caregiver_availability_slots").insert(rows);
        if (avErr) throw new Error(`availability insert failed for ${u.email}: ${avErr.message}`);
      }
    }
  }

  // Organisation
  let orgId = null;
  if (u.organization) {
    const o = u.organization;
    // Try to find an existing org via membership; otherwise create
    const { data: membership } = await supa
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (membership?.organization_id) {
      orgId = membership.organization_id;
      await supa
        .from("organizations")
        .update({
          legal_name: o.legal_name,
          trading_name: o.trading_name,
          country: o.country,
          org_type: o.org_type,
          purpose: o.purpose,
          companies_house_number: o.companies_house_number,
          vat_number: o.vat_number,
          year_established: o.year_established,
          size_band: o.size_band,
          website: o.website,
          cqc_number: o.cqc_number,
          verification_status: o.verification_status,
          booking_enabled: o.booking_enabled,
        })
        .eq("id", orgId);
    } else {
      const { data: newOrg, error: orgErr } = await supa
        .from("organizations")
        .insert({
          legal_name: o.legal_name,
          trading_name: o.trading_name,
          country: o.country,
          org_type: o.org_type,
          purpose: o.purpose,
          companies_house_number: o.companies_house_number,
          vat_number: o.vat_number,
          year_established: o.year_established,
          size_band: o.size_band,
          website: o.website,
          cqc_number: o.cqc_number,
          verification_status: o.verification_status,
          booking_enabled: o.booking_enabled,
        })
        .select("id")
        .single();
      if (orgErr) throw new Error(`organizations insert failed: ${orgErr.message}`);
      orgId = newOrg.id;

      const { error: memErr } = await supa.from("organization_members").insert({
        organization_id: orgId,
        user_id: userId,
        role: "owner",
      });
      // Some schemas may not require/expect 'role'; ignore if column missing.
      if (memErr && !/column .* role/i.test(memErr.message)) {
        throw new Error(`organization_members insert failed: ${memErr.message}`);
      }
    }
  }

  return { userId, orgId };
}

async function seedSampleReviews(carerUserId, seekerUserId) {
  // Add 3 sample reviews if the carer has fewer than 3. Idempotent-ish: we
  // upsert by a unique synthetic key (booking_id is required if FK exists, so
  // just don't insert if reviews already exist for this carer from our seeker).
  const { count } = await supa
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("caregiver_id", carerUserId)
    .eq("reviewer_id", seekerUserId);
  if ((count ?? 0) > 0) return;

  const sample = [
    { rating: 5, body: "Priya was an absolute godsend during my mother's recovery. Punctual, kind, and incredibly knowledgeable. We will book again." },
    { rating: 5, body: "We feel very lucky to have found this carer through SpecialCarer. They went above and beyond on every visit." },
    { rating: 4, body: "Lovely person, great with my dad. Communication could be slightly faster but overall a really good experience." },
  ];

  for (const r of sample) {
    const { error } = await supa.from("reviews").insert({
      caregiver_id: carerUserId,
      reviewer_id: seekerUserId,
      rating: r.rating,
      body: r.body,
    });
    if (error && !/duplicate|unique|booking_id/i.test(error.message)) {
      // Some schemas require booking_id — silently skip if so.
      console.warn(`  ⚠️  Skipped review insert for ${carerUserId}: ${error.message}`);
      break;
    }
  }
}

async function main() {
  console.log("🌱 Seeding test users…\n");
  const results = [];
  let seekerId = null;
  const carerIds = [];

  for (const u of TEST_USERS) {
    try {
      const { userId, orgId } = await ensureUser(u);
      results.push({ ok: true, label: u.label, email: u.email, password: u.password, userId, orgId });
      if (u.role === "seeker" && !u.organization) seekerId = userId;
      if (u.caregiver) carerIds.push(userId);
      console.log(`  ✓ ${u.label.padEnd(28)} ${u.email.padEnd(38)} -> ${userId}`);
    } catch (e) {
      console.error(`  ✗ ${u.label}: ${e.message}`);
      results.push({ ok: false, label: u.label, email: u.email, error: e.message });
    }
  }

  // Seed sample reviews from the test seeker for each test caregiver.
  if (seekerId && carerIds.length) {
    console.log("\n💬 Adding sample reviews…");
    for (const carerId of carerIds) {
      await seedSampleReviews(carerId, seekerId);
    }
  }

  console.log("\n────────────────────────────────────────────────────");
  console.log("📋 TEST CREDENTIALS (shared password for all)");
  console.log("    Password:", SHARED_PASSWORD);
  console.log("────────────────────────────────────────────────────");
  for (const r of results.filter((x) => x.ok)) {
    console.log(`  • ${r.label.padEnd(28)} ${r.email}`);
  }
  if (results.some((x) => !x.ok)) {
    console.log("\n⚠️  Failures:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • ${r.label}: ${r.error}`);
    }
  }
  console.log("────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
