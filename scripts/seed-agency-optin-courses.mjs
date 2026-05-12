#!/usr/bin/env node
/**
 * Phase 2 seed (v2): mark the SIX Channel B mandatory training courses
 * with `required_for_agency_optin = true`, and seed
 * `course_population_requirements` with their adult/child/always mapping.
 *
 *   - manual-handling           (always)
 *   - infection-control         (always)
 *   - food-hygiene              (always — NEW in v2)
 *   - medication-administration (always — NEW in v2)
 *   - safeguarding-adults       (required when works_with_adults)
 *   - safeguarding-children     (required when works_with_children — NEW in v2)
 *
 * Run manually:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-agency-optin-courses.mjs
 *
 * Also pre-flights the UK smoke-test carer (test.carer.uk@specialcarer.com,
 * "Priya") with: a countersigned worker_b contract, cleared DBS, cleared
 * RTW, and 3 passed training enrollments (manual handling, infection
 * control, safeguarding adults). Per the v2 grace policy, Priya is
 * already 'active' so she gets a 30-day grace window and STAYS active
 * even though she's missing food-hygiene and medication-administration.
 *
 * Idempotent. Safe to re-run.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL).",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const COURSES = [
  {
    slug: "safeguarding-adults",
    title: "Safeguarding Adults",
    summary:
      "Recognising, recording and reporting abuse and neglect in adult care settings. Required for carers who work with adults.",
    category: "compliance",
    duration_minutes: 30,
    sort_order: 10,
    country_scope: "UK",
  },
  {
    slug: "manual-handling",
    title: "Manual Handling",
    summary:
      "Safe moving and handling of people and loads. Risk assessment, equipment, and protecting your back. Required for Channel B carers.",
    category: "clinical",
    duration_minutes: 30,
    sort_order: 11,
    country_scope: "UK",
  },
  {
    slug: "infection-control",
    title: "Infection Prevention & Control",
    summary:
      "Standard precautions, PPE, hand hygiene, and outbreak protocols in domiciliary care. Required for Channel B carers.",
    category: "clinical",
    duration_minutes: 30,
    sort_order: 12,
    country_scope: "UK",
  },
  {
    slug: "food-hygiene",
    title: "Food Hygiene",
    summary:
      "Safe food handling, storage, and meal preparation in domiciliary care. Required for all Channel B carers.",
    category: "compliance",
    duration_minutes: 30,
    sort_order: 13,
    country_scope: "UK",
    accepted_certifications: ["CIEH Level 2", "RSPH Level 2", "Highfield Level 2"],
  },
  {
    slug: "medication-administration",
    title: "Medication Administration",
    summary:
      "Safe administration of medication in domiciliary care: the 6 rights, MAR sheets, controlled drugs. Required for all Channel B carers.",
    category: "clinical",
    duration_minutes: 45,
    sort_order: 14,
    country_scope: "UK",
    accepted_certifications: ["Skills for Care — Safe Handling of Medication", "QCF Level 2 Medication"],
  },
  {
    slug: "safeguarding-children",
    title: "Safeguarding Children",
    summary:
      "Recognising, recording and reporting abuse and neglect in child care settings. Required for carers who work with children.",
    category: "compliance",
    duration_minutes: 45,
    sort_order: 15,
    country_scope: "UK",
  },
];

const POPULATION_REQUIREMENTS = [
  { course_slug: "manual-handling",          always_required: true,  required_for_adults: false, required_for_children: false },
  { course_slug: "infection-control",        always_required: true,  required_for_adults: false, required_for_children: false },
  { course_slug: "food-hygiene",             always_required: true,  required_for_adults: false, required_for_children: false },
  { course_slug: "medication-administration", always_required: true,  required_for_adults: false, required_for_children: false },
  { course_slug: "safeguarding-adults",      always_required: false, required_for_adults: true,  required_for_children: false },
  { course_slug: "safeguarding-children",    always_required: false, required_for_adults: false, required_for_children: true  },
];

const CURRENT_WORKER_B_VERSION = "wkr-v1.0-2026-05";
const TEST_CARER_EMAIL = "test.carer.uk@specialcarer.com";

async function seedCourses() {
  console.log("→ Seeding/updating 6 mandatory courses…");
  const ids = {};
  for (const c of COURSES) {
    const { data: existing } = await admin
      .from("training_courses")
      .select("id, slug")
      .eq("slug", c.slug)
      .maybeSingle();
    const update = {
      required_for_agency_optin: true,
      is_required: true,
    };
    if (c.accepted_certifications) {
      update.accepted_certifications = c.accepted_certifications;
    }
    if (existing) {
      const { error } = await admin
        .from("training_courses")
        .update(update)
        .eq("id", existing.id);
      if (error) throw new Error(`update ${c.slug}: ${error.message}`);
      ids[c.slug] = existing.id;
      console.log(`  ✓ updated ${c.slug}`);
    } else {
      const insertPayload = {
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        category: c.category,
        duration_minutes: c.duration_minutes,
        sort_order: c.sort_order,
        country_scope: c.country_scope,
        published_at: new Date().toISOString(),
        required_for_agency_optin: true,
        is_required: true,
      };
      if (c.accepted_certifications) {
        insertPayload.accepted_certifications = c.accepted_certifications;
      }
      const { data, error } = await admin
        .from("training_courses")
        .insert(insertPayload)
        .select("id")
        .single();
      if (error) throw new Error(`insert ${c.slug}: ${error.message}`);
      ids[c.slug] = data.id;
      console.log(`  ✓ inserted ${c.slug}`);
    }
  }
  return ids;
}

async function seedPopulationRequirements() {
  console.log("→ Seeding course_population_requirements…");
  for (const r of POPULATION_REQUIREMENTS) {
    const { error } = await admin
      .from("course_population_requirements")
      .upsert(r, { onConflict: "course_slug" });
    if (error) {
      console.error(`  ✗ ${r.course_slug}: ${error.message}`);
    } else {
      console.log(
        `  ✓ ${r.course_slug} · always=${r.always_required} adults=${r.required_for_adults} children=${r.required_for_children}`,
      );
    }
  }
}

async function findTestCarer() {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === TEST_CARER_EMAIL,
    );
    if (found) return found;
    if (data.users.length < 100) break;
    page++;
  }
  return null;
}

async function preflightTestCarer(courseIds) {
  console.log(`→ Preflighting ${TEST_CARER_EMAIL}…`);
  const user = await findTestCarer();
  if (!user) {
    console.log("  ⚠ test carer not found in auth.users — skipping");
    return;
  }
  const userId = user.id;
  console.log(`  user_id=${userId}`);

  const now = new Date();
  const nowIso = now.toISOString();

  // Worker_b contract — signed + countersigned.
  {
    const { data: existing } = await admin
      .from("organization_contracts")
      .select("id")
      .eq("signed_by_user_id", userId)
      .eq("contract_type", "worker_b")
      .eq("version", CURRENT_WORKER_B_VERSION)
      .maybeSingle();
    const payload = {
      contract_type: "worker_b",
      version: CURRENT_WORKER_B_VERSION,
      markdown_path: `src/contracts/${CURRENT_WORKER_B_VERSION}.md`,
      status: "active",
      signed_by_user_id: userId,
      signed_by_name: "Priya Patel",
      signed_by_role: "Carer",
      signed_at: nowIso,
      signature_ip: "127.0.0.1",
      signature_user_agent: "seed-script",
      signature_method: "clickwrap",
      countersigned_at: nowIso,
      effective_from: nowIso,
    };
    if (existing) {
      await admin.from("organization_contracts").update(payload).eq("id", existing.id);
    } else {
      await admin.from("organization_contracts").insert(payload);
    }
    console.log("  ✓ worker_b contract: active");
  }

  // Enhanced DBS — cleared 60 days ago.
  {
    const issuedAt = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + 305 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("background_checks")
      .select("id")
      .eq("user_id", userId)
      .eq("check_type", "enhanced_dbs_barred")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = {
      user_id: userId,
      vendor: "uchecks",
      check_type: "enhanced_dbs_barred",
      status: "cleared",
      issued_at: issuedAt,
      expires_at: expiresAt,
      reverify_status: "cleared",
    };
    if (existing) {
      await admin.from("background_checks").update(payload).eq("id", existing.id);
    } else {
      await admin.from("background_checks").insert(payload);
    }
    console.log("  ✓ enhanced_dbs_barred: cleared (60d ago)");
  }

  // Right to Work — cleared.
  {
    const issuedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const nextReverify = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: existing } = await admin
      .from("background_checks")
      .select("id")
      .eq("user_id", userId)
      .eq("check_type", "right_to_work")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = {
      user_id: userId,
      vendor: "uchecks",
      check_type: "right_to_work",
      status: "cleared",
      issued_at: issuedAt,
      reverify_status: "cleared",
      next_reverify_at: nextReverify,
      reverify_cadence_months: 12,
    };
    if (existing) {
      await admin.from("background_checks").update(payload).eq("id", existing.id);
    } else {
      await admin.from("background_checks").insert(payload);
    }
    console.log(`  ✓ right_to_work: cleared (next_reverify ${nextReverify})`);
  }

  // 3 enrollments under the OLD model: manual handling, infection control,
  // safeguarding adults. The new model adds food-hygiene + medication-administration
  // which are intentionally NOT seeded — this exercises the grace-period path.
  const SEEDED_SLUGS = [
    "manual-handling",
    "infection-control",
    "safeguarding-adults",
  ];
  for (const slug of SEEDED_SLUGS) {
    const courseId = courseIds[slug];
    if (!courseId) continue;
    const { data: existing } = await admin
      .from("training_enrollments")
      .select("id")
      .eq("carer_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();
    const payload = {
      carer_id: userId,
      course_id: courseId,
      quiz_passed_at: nowIso,
    };
    if (existing) {
      await admin.from("training_enrollments").update(payload).eq("id", existing.id);
    } else {
      await admin.from("training_enrollments").insert(payload);
    }
    console.log(`  ✓ training enrollment: ${slug} (passed)`);
  }

  // Profile — put Priya in the 30-day grace window, still 'active'.
  // Adults-only (default). Status stays active despite missing 2 new courses.
  const graceUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await admin
    .from("profiles")
    .update({
      agency_opt_in_status: "active",
      agency_opt_in_started_at: nowIso,
      agency_opt_in_submitted_at: nowIso,
      agency_opt_in_approved_at: nowIso,
      agency_opt_in_rejected_reason: null,
      works_with_adults: true,
      works_with_children: false,
      agency_optin_grace_period_until: graceUntil,
    })
    .eq("id", userId);
  console.log(
    `  ✓ profile: active + grace_until=${graceUntil} (works_with_adults=true)`,
  );
}

async function main() {
  const ids = await seedCourses();
  await seedPopulationRequirements();
  await preflightTestCarer(ids);
  console.log(
    "\nDone. Visit /admin/agency-optin (Priya is active in grace) and /admin/agency-optin/child-opt-ins (empty until someone toggles works_with_children).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
