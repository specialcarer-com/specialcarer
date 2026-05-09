-- Training Hub v3.9 — continuing-education courses with video, longer
-- quizzes, CEU credits and PDF certificates. SEPARATE from the
-- vetting onboarding course (carer_course_progress) and the
-- per-vertical skills quiz (carer_skills_attempts). Both vetting
-- artefacts continue to exist untouched.
--
-- Idempotent: tables, indexes, policies, view, trigger, seeds all
-- guarded. Seeds use `on conflict (slug) do nothing` for courses and
-- a NOT EXISTS guard for the per-course question batch.

-- ── training_courses ────────────────────────────────────────────────
create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) between 1 and 80),
  title text not null,
  summary text not null,
  category text not null check (category in ('clinical','behavioural','operational','compliance')),
  is_required boolean not null default false,
  ceu_credits numeric(4,2) not null default 1.00 check (ceu_credits > 0),
  video_url text,
  video_provider text not null default 'embed' check (video_provider in ('embed','mp4','youtube')),
  transcript_md text,
  duration_minutes int not null default 30 check (duration_minutes > 0),
  country_scope text not null default 'both' check (country_scope in ('UK','US','both')),
  required_for_verticals text[] not null default '{}',
  sort_order int not null default 0,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_courses_sort_idx
  on public.training_courses (sort_order);
create index if not exists training_courses_slug_idx
  on public.training_courses (slug);

alter table public.training_courses enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'training_courses_public_select'
      and tablename = 'training_courses'
  ) then
    create policy training_courses_public_select on public.training_courses
      for select to anon, authenticated
      using (published_at <= now());
  end if;
end $$;

-- ── training_quiz_questions ─────────────────────────────────────────
create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  sort_order int not null default 0,
  prompt text not null,
  options jsonb not null,
  correct_index int not null check (correct_index between 0 and 3),
  explanation text,
  created_at timestamptz not null default now()
);
create index if not exists training_quiz_questions_course_idx
  on public.training_quiz_questions (course_id, sort_order);

alter table public.training_quiz_questions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'training_quiz_questions_public_select'
      and tablename = 'training_quiz_questions'
  ) then
    create policy training_quiz_questions_public_select on public.training_quiz_questions
      for select to anon, authenticated
      using (true);
  end if;
end $$;

-- ── training_enrollments ───────────────────────────────────────────
create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  carer_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.training_courses(id) on delete cascade,
  started_at timestamptz not null default now(),
  video_completed_at timestamptz,
  quiz_passed_at timestamptz,
  quiz_best_score int default 0 check (quiz_best_score between 0 and 100),
  attempts int not null default 0,
  certificate_url text,
  ceu_credits_awarded numeric(4,2) not null default 0,
  verification_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carer_id, course_id)
);
create index if not exists training_enrollments_carer_idx
  on public.training_enrollments (carer_id);
create index if not exists training_enrollments_course_idx
  on public.training_enrollments (course_id);

alter table public.training_enrollments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'training_enrollments_owner_rw'
      and tablename = 'training_enrollments'
  ) then
    create policy training_enrollments_owner_rw on public.training_enrollments
      for all to authenticated
      using (carer_id = (select auth.uid()))
      with check (carer_id = (select auth.uid()));
  end if;
end $$;

create or replace function public.training_enrollments_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'training_enrollments_touch_trg'
  ) then
    create trigger training_enrollments_touch_trg
      before update on public.training_enrollments
      for each row execute function public.training_enrollments_touch();
  end if;
end $$;

-- ── training_quiz_attempts ─────────────────────────────────────────
create table if not exists public.training_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.training_enrollments(id) on delete cascade,
  score int not null check (score between 0 and 100),
  passed boolean not null,
  answers jsonb not null,
  attempted_at timestamptz not null default now()
);
create index if not exists training_quiz_attempts_enrollment_idx
  on public.training_quiz_attempts (enrollment_id);

alter table public.training_quiz_attempts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'training_quiz_attempts_owner_rw'
      and tablename = 'training_quiz_attempts'
  ) then
    create policy training_quiz_attempts_owner_rw on public.training_quiz_attempts
      for all to authenticated
      using (
        exists (
          select 1 from public.training_enrollments e
          where e.id = enrollment_id and e.carer_id = (select auth.uid())
        )
      )
      with check (
        exists (
          select 1 from public.training_enrollments e
          where e.id = enrollment_id and e.carer_id = (select auth.uid())
        )
      );
  end if;
end $$;

-- ── carer_ceu_totals_v ──────────────────────────────────────────────
create or replace view public.carer_ceu_totals_v as
  select
    carer_id,
    extract(year from quiz_passed_at)::int as year,
    sum(ceu_credits_awarded)::numeric(6,2) as total_credits
  from public.training_enrollments
  where quiz_passed_at is not null
  group by carer_id, extract(year from quiz_passed_at);

grant select on public.carer_ceu_totals_v to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Seed 4 courses + 5 quiz questions each. `on conflict do nothing` on
-- the slug means re-running is safe. Questions are inserted only if
-- the course currently has zero questions, so the seed never
-- duplicates and never overwrites later admin edits.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. pediatric_first_aid ───────────────────────────────────────
insert into public.training_courses
  (slug, title, summary, category, is_required, ceu_credits,
   video_url, video_provider, duration_minutes, country_scope,
   required_for_verticals, sort_order, transcript_md)
values (
  'pediatric_first_aid',
  'Paediatric First Aid Essentials',
  'Recognising and responding to common emergencies for infants and children: choking, anaphylaxis, seizures, head injury, and CPR.',
  'clinical', true, 2.00,
  'https://www.youtube.com/embed/Z5VVuBSt8U4', 'youtube', 60, 'both',
  ARRAY['childcare','special_needs'], 10,
$md$# Paediatric First Aid Essentials

This module is designed for professional carers who may, at any moment, be the only adult between a child and a serious outcome. The aim is not to replace formal training (Red Cross, St John Ambulance, American Heart Association) but to keep your knowledge current between recertifications.

## 1. Scene safety and first response
Before you touch the child, make the scene safe. A pool deck still wet, a pan still on the hob, an unrestrained dog, an electrical hazard — your own injury helps no one. Once safe, perform an AVPU assessment:
- **A**lert: eyes open, responsive
- **V**oice: responds to you calling their name
- **P**ain: responds only to a gentle pinch on the shoulder
- **U**nresponsive: no response

If the child is unresponsive, shout for help, call **999 (UK) / 911 (US)** immediately, and start the relevant intervention. If you are alone with an infant or small child and CPR is needed, perform 1 minute of CPR before leaving them to call.

## 2. Recovery position
For an unresponsive child who is breathing normally and has no suspected spinal injury, place them on their side with the head tilted slightly back to keep the airway open and prevent aspiration of vomit. For an infant under 1 year, you may need to support the head and torso in your forearm with the head lower than the body so any fluid drains out. Reassess breathing every minute. Do not leave them unattended.

## 3. Choking — the critical age divide
**Infants (under 1 year)** — give 5 firm back blows between the shoulder blades while supporting the head. If unsuccessful, turn the infant face up and give 5 chest thrusts using two fingers on the lower half of the sternum. **Never give abdominal thrusts to an infant** — the liver is unprotected and you can cause fatal abdominal injury. This is true in both UK and US guidelines.
**Children (1 year and older)** — 5 back blows between the shoulder blades, then 5 abdominal thrusts (Heimlich). Repeat in cycles of 5+5 until the obstruction clears or the child becomes unresponsive. If unresponsive, start CPR and a finger sweep is only done if the obstruction is visible — never blind-sweep.

## 4. Anaphylaxis and adrenaline auto-injectors
Signs include sudden swelling of lips/tongue, hoarseness, wheeze, generalised hives, pallor, vomiting, drowsiness, or collapse. If a known allergic child has these signs after exposure, administer adrenaline immediately — **do not wait** for confirmation. EpiPen and Auvi-Q are administered to the **outer mid-thigh**, through clothing if necessary, held in place for 3 seconds (EpiPen) or 2 seconds (Auvi-Q) — follow the device instructions. Then call 999 / 911. A second dose may be needed if symptoms persist after 5 minutes. Lay the child flat with legs raised; only sit them up if breathing is the primary problem.

## 5. Febrile seizures
Most common in children aged 6 months to 5 years during a fever. The seizure usually lasts under 5 minutes. **Do not** restrain the child, put anything in their mouth, or attempt to move them unless they are in a dangerous spot. Time the seizure. Place soft objects around their head. Once it stops, place them in the recovery position. Call 999 / 911 if: it is the first febrile seizure, it lasts longer than 5 minutes, breathing remains irregular afterwards, or another seizure follows.

## 6. Head injuries
A child who has hit their head should be observed for at least 24 hours. Red flags requiring immediate emergency response: loss of consciousness (any duration), repeated vomiting, unequal pupils, fluid or blood from nose or ears, seizure, irritability that won't settle, marked drowsiness, or visible skull deformity. For mild bumps, apply a cold compress, observe, and reassure.

## 7. CPR for children
Hand technique is scaled to the child's size:
- **Infant under 1 year**: two fingers, lower half of sternum, depth ~4 cm.
- **Child 1 to puberty**: heel of one hand (or both for larger children), depth ~5 cm.
- **Adolescent**: adult two-handed technique, depth ~5–6 cm.
Ratio for a **lay rescuer working alone**: 30 chest compressions to 2 rescue breaths. Ratio for **two trained rescuers**: 15:2 in children. Rate is 100–120 compressions per minute. Continue until the child responds, an AED arrives, or paramedics take over.

## 8. AED use in children
Paediatric pads or paediatric mode for children under 8 / under 25 kg if available. If not, use adult pads — placement is one on the chest and one on the back to keep them from touching. Continue CPR while the AED analyses. Follow the voice prompts.

## 9. Burns and scalds
Cool with running cool (not ice) water for at least 20 minutes, even if you have to call an ambulance during it. Remove jewellery and loose clothing not stuck to the burn. Cover loosely with cling film or a clean non-fluffy cloth. Never apply butter, toothpaste, or creams. Anything larger than the child's palm, or any burn to the face, hands, feet, genitals, or across a joint, warrants emergency review.

## 10. After any incident
Document: time, what happened, what you did, the child's response, and who you called. This protects the child (continuity of care), the family (trust), and you. Inform the parents/guardian as soon as possible and the platform's safeguarding lead via the SpecialCarer in-app form.
$md$
)
on conflict (slug) do nothing;

do $$
declare cid uuid;
begin
  select id into cid from public.training_courses where slug = 'pediatric_first_aid';
  if cid is not null and not exists (
    select 1 from public.training_quiz_questions where course_id = cid
  ) then
    insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
    (cid, 1,
      'A 6-month-old is choking on a piece of carrot. After 5 back blows fail, what do you do next?',
      '["5 abdominal thrusts","5 chest thrusts with two fingers on the sternum","Blind finger sweep","Hold them upside down by the ankles"]'::jsonb,
      1,
      'Abdominal thrusts are NOT given to infants under 1 year because of liver injury risk. Five chest thrusts with two fingers low on the sternum is the correct paediatric BLS step.'),
    (cid, 2,
      'Where is an EpiPen administered, and how long is it held in place?',
      '["Buttock, 1 second","Outer mid-thigh, 3 seconds","Upper arm, 5 seconds","Abdomen, 10 seconds"]'::jsonb,
      1,
      'EpiPens go into the outer mid-thigh (vastus lateralis) and are held for 3 seconds; through clothing is fine in an emergency.'),
    (cid, 3,
      'A child is recovering after a febrile seizure. They are breathing normally but unconscious. What position do you place them in, and for how long do you reassess?',
      '["Flat on back, every 5 minutes","Recovery position, every minute","Sitting up, only when ambulance arrives","Prone face down, every 10 minutes"]'::jsonb,
      1,
      'Recovery position keeps the airway open and lets vomit drain. Reassess breathing every minute and stay with the child.'),
    (cid, 4,
      'You find an unresponsive 4-year-old who is not breathing. You are alone. What is the very first action?',
      '["Run to call 999/911 and return","Start 1 minute of CPR, then call 999/911","Apply the AED first","Try to wake them with cold water"]'::jsonb,
      1,
      'For paediatric arrest with a lone rescuer, give 1 minute of CPR FIRST, then leave to call. Adult guidance (call first) does not apply to children.'),
    (cid, 5,
      'A 7-year-old has a febrile seizure that has lasted 6 minutes. What should you do?',
      '["Restrain their arms to stop the shaking","Put a wooden spoon between their teeth","Time the seizure, clear hazards, and call 999/911","Pour cold water on them"]'::jsonb,
      2,
      'Never restrain or insert objects. A seizure lasting longer than 5 minutes is a 999/911 emergency.');
  end if;
end $$;

-- ─── 2. dementia_care ─────────────────────────────────────────────
insert into public.training_courses
  (slug, title, summary, category, is_required, ceu_credits,
   video_url, video_provider, duration_minutes, country_scope,
   required_for_verticals, sort_order, transcript_md)
values (
  'dementia_care',
  'Dementia Care Fundamentals',
  'Person-centred care for people living with dementia: communication, distress reduction, sundowning, and recognising delirium.',
  'clinical', true, 2.00,
  'https://www.youtube.com/embed/CrZXz10FcVM', 'youtube', 60, 'both',
  ARRAY['elderly_care'], 20,
$md$# Dementia Care Fundamentals

Dementia is an umbrella term for progressive conditions that affect memory, cognition, and behaviour. Alzheimer's is the most common type but vascular dementia, Lewy body dementia, and frontotemporal dementia each present differently. Good care is **person-centred**: built around the individual's life history, preferences, and remaining strengths rather than their deficits.

## 1. Stages and what to expect
- **Early stage**: forgetfulness, word-finding difficulty, mood changes. The person is largely independent and aware.
- **Middle stage**: needs help with daily tasks (medication, finances), confusion about time/place, possible agitation, sleep disturbance.
- **Late stage**: significant physical dependency, communication mostly non-verbal, swallowing difficulties.

## 2. Communication that works
- Approach from the front; introduce yourself by name every time. ("Hello Margaret, it's Sara — I'm here to help with breakfast.")
- Use short sentences with one idea each. Pause for processing time — this can take 30 seconds and feels like an eternity but rushing causes shutdown.
- Use the person's name often. Avoid pronouns like "this", "that", "her", "him" without a clear referent.
- Match your tone to the message. People with dementia retain emotional reading long after literal comprehension fades.
- Don't argue with reality. If Mrs L tells you her father is coming for tea (he died decades ago), do not say "your father is dead" — this re-traumatises. Validate the feeling, then redirect: "It sounds like you really miss your dad. Tell me about him while we set the table."

## 3. Validation over correction
Validation therapy, developed by Naomi Feil, accepts the person's emotional reality even when their factual reality is wrong. Correction tends to escalate distress because the person cannot retain the corrected information but does retain the feeling of being wrong. Validate, distract, redirect.

## 4. Sundowning
A pattern of increased confusion, agitation, and wandering in the late afternoon and evening. Theories include circadian disruption, fatigue, dim light + shadows being misinterpreted, and accumulated stimulation. Practical responses:
- Bright lighting from late afternoon onwards.
- Limit caffeine and naps after lunch.
- Keep a predictable late-day routine.
- Keep stimulation low — quiet music the person likes, no television news.
- Plan high-cognitive-demand activities for the morning.

## 5. Delirium vs dementia — the red flag
**Sudden change in cognition is delirium until proven otherwise.** Delirium is a medical emergency. The most common reversible causes are urinary tract infections, chest infections, medication changes (especially anticholinergics, opiates, benzodiazepines), dehydration, constipation, and pain. Signs:
- Rapid onset over hours to days (dementia is gradual over months/years).
- Fluctuating consciousness — the person seems lucid one moment, completely lost the next.
- Hallucinations (seeing things), particularly in Lewy body but new in any other dementia is suspicious.
- Markedly disturbed sleep–wake cycle.

Action: contact the GP or call NHS 111 / non-emergency line same-day; if vital signs are unstable, 999 / 911. Document onset time and what changed.

## 6. Distressed behaviour
"Behaviour" is communication. Ask: what unmet need might this be expressing? Pain (especially in late-stage when verbal expression is gone), hunger, thirst, needing the toilet, too hot/cold, boredom, loneliness, fear of an unfamiliar carer, or an environmental trigger like noise. Solve those before reaching for medication. Antipsychotics (risperidone, haloperidol) are last-resort and have a black-box warning of increased mortality in dementia patients.

## 7. Capacity and consent
**UK: Mental Capacity Act 2005**. Capacity is decision-specific and time-specific. Assume capacity unless there is evidence to the contrary. The two-stage test: (1) is there an impairment of mind/brain? (2) is the person unable to understand, retain, weigh, and communicate the decision? If they lack capacity for a specific decision, it must be made in their best interests, considering past wishes, the views of those close to them, and the least-restrictive option. An LPA (Lasting Power of Attorney) for Health & Welfare may be in place — ask the family.

**US: substituted judgement / best interests**. State law varies. A durable power of attorney for healthcare (POA) or a healthcare proxy may have been appointed. Advance directives (living wills) should be honoured.

In both jurisdictions, **carers do not assess capacity** — that is for clinicians — but you observe and document what you see and report it.

## 8. Driving
Driving cessation is one of the hardest conversations. People with early dementia may still drive safely, but as the condition progresses risk grows. UK: the person must inform the DVLA. US: state DMVs have varying processes. Your role is to flag concerns to the family/clinician, never to confiscate keys yourself.

## 9. Medications you may see
Carers do not dispense (unless trained and authorised) but you should recognise:
- **Donepezil** (Aricept), **rivastigmine**, **galantamine** — cholinesterase inhibitors for Alzheimer's; common GI side effects.
- **Memantine** — NMDA antagonist for moderate-to-severe Alzheimer's.
- **Antipsychotics** — see distress section above.

If a person on cholinesterase inhibitors becomes newly unwell after starting or a dose change, mention this to the GP — it is most often the medication.

## 10. Looking after yourself
Dementia care can be emotionally demanding. Use the SpecialCarer support resources, take your breaks, and debrief with peers or a supervisor. Compassion fatigue is real and burnout helps no one — least of all the person you care for.
$md$
)
on conflict (slug) do nothing;

do $$
declare cid uuid;
begin
  select id into cid from public.training_courses where slug = 'dementia_care';
  if cid is not null and not exists (
    select 1 from public.training_quiz_questions where course_id = cid
  ) then
    insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
    (cid, 1,
      'An 82-year-old who normally has mild dementia becomes acutely confused over 24 hours, has a fluctuating level of consciousness and is now seeing children in the room. What is your first concern?',
      '["Worsening dementia — call the dementia clinic next week","Delirium — contact GP / 111 same day","Sundowning — close the curtains","Boredom — put on the television"]'::jsonb,
      1,
      'Sudden onset, fluctuation, and new hallucinations point to delirium, which is a medical emergency. Most causes are reversible (UTI, chest infection, medication).'),
    (cid, 2,
      'Mrs P insists her late husband is coming home for dinner. What is the best response?',
      '["Tell her firmly that he died","Validate the feeling and gently redirect","Ignore her and walk away","Show her the death certificate"]'::jsonb,
      1,
      'Validation therapy: accept the emotion, redirect to a positive related activity. Correction causes re-traumatisation each time.'),
    (cid, 3,
      'A normally settled resident becomes agitated and wandering each evening between 5 and 7 pm. Which is NOT a recommended sundowning response?',
      '["Bright lighting from late afternoon","A loud television news programme","Limiting late caffeine","Predictable evening routine"]'::jsonb,
      1,
      'TV news is over-stimulating and the unpredictability worsens agitation. Calm, predictable, well-lit environments help.'),
    (cid, 4,
      'Under the UK Mental Capacity Act 2005, who is responsible for assessing capacity for a specific medical decision?',
      '["The carer on shift","Any family member","A clinician (or trained professional) using the two-stage test","Any adult who has known the person for over a year"]'::jsonb,
      2,
      'Carers observe and document. A clinician — or a suitably trained professional — performs the two-stage test for a specific decision at a specific time.'),
    (cid, 5,
      'A person with late-stage dementia is hitting out during personal care. What is the FIRST thing you should consider?',
      '["Request antipsychotic medication","An unmet need — pain, fear, cold, dignity","Discontinue all personal care","Apply restraints"]'::jsonb,
      1,
      'Behaviour is communication. Antipsychotics carry a black-box warning of increased mortality in dementia and are last-resort.');
  end if;
end $$;

-- ─── 3. lifting_transfers ─────────────────────────────────────────
insert into public.training_courses
  (slug, title, summary, category, is_required, ceu_credits,
   video_url, video_provider, duration_minutes, country_scope,
   required_for_verticals, sort_order, transcript_md)
values (
  'lifting_transfers',
  'Safe Lifting & Transfers',
  'Manual handling for carers: bed-to-chair transfers, hoists, sit-to-stand aids, and back-protection technique.',
  'clinical', true, 1.00,
  'https://www.youtube.com/embed/QGvrSsMkB28', 'youtube', 30, 'both',
  ARRAY['elderly_care','complex_care'], 30,
$md$# Safe Lifting & Transfers

Manual-handling injuries are the leading cause of carer time off in both the UK and US. Almost all are preventable. The single most important shift is from "lift" to "transfer with appropriate equipment."

## 1. TILE — assess every transfer
- **T**ask: what are you trying to achieve? Bed-to-chair, sit-to-stand, repositioning?
- **I**ndividual: who is doing the transfer? Your training, your physical fitness, the second carer.
- **L**oad: the person — their weight, ability to weight-bear, cognition, cooperation, pain.
- **E**nvironment: floor surface, space, lighting, clutter, height of bed/chair.

If any of these is not safe, stop. Get the right equipment, the right people, or wait for a colleague.

## 2. Neutral spine — the technique that protects you
- Feet shoulder-width apart, one slightly forward.
- Bend at hips and knees, not at the waist.
- Keep the load close to your body.
- Move smoothly — no jerks.
- Pivot with your feet; do not twist your torso.
- Engage your core before the move.
- Look forward, not down.

## 3. Never lift alone what should be hoisted
The era of two carers manually lifting an immobile adult is over. Hoists are the standard of care for any non-weight-bearing transfer. UK guidance (HSE) and US guidance (OSHA / ANA "Safe Patient Handling") align on this.

## 4. Hoist pre-use check
Before every use:
- Battery charged.
- Sling: correct size, no fraying, no tears, loops in good condition.
- Loop colours match on each side.
- Service sticker in date.
- Brakes work on the hoist base.
- Spreader bar swivels freely.
- The person's weight is within the SWL (safe working load).

If anything is wrong, do not use it. Tag it out and report.

## 5. Slings — sizing matters
A sling that is too small dangles the person; too large, they slip. Standard sizes: small, medium, large, XL. The person's weight, body shape, and mobility level all influence the choice. If unsure, contact the OT (Occupational Therapist) or care coordinator.

## 6. Slide sheets
For repositioning in bed (up-the-bed, side-to-side, sit-to-edge). They reduce friction and shear, protecting both the person's skin (pressure injuries) and your back. Use two slide sheets together — one slides on the other. Always remove after use; left in place they're a falls risk.

## 7. Sit-to-stand aids
For people who can weight-bear partially. The person uses their own muscle power, supported by the device. Never use a sit-to-stand on someone who cannot weight-bear, cannot follow instructions, or has had a recent fracture/surgery. If they're shaking or going pale, stop and lower them back.

## 8. When to refuse a manual lift
You are professionally and ethically required to refuse a transfer that is unsafe. This includes:
- The person is not weight-bearing and no hoist is available.
- The required hoist or sling is broken or unavailable.
- You are alone and the transfer requires two.
- The environment is unsafe (wet floor, blocked path, inadequate space).
- You feel under the influence of pain medication, fatigue, or recent injury.

Refusal is not insubordination. Document and report to the family/coordinator immediately.

## 9. Falls — and what NOT to do
If a person falls, **do not move them** if there is any possibility of spinal injury (head/neck strike, age >65, on anticoagulants, or pain on movement). Call 999 / 911. Reassure, keep them warm and dry, and stay with them.

If the fall is uncomplicated and they want to get up, use a falls-lifter device or two-carer assist with a chair behind them — never lift them under the arms (rotator cuff and shoulder injury risk for both you and them).

## 10. Document every transfer issue
Near misses, refusals, equipment problems, and any minor injuries — document. The pattern is what changes practice. SpecialCarer's Trust & Safety form is the right channel.
$md$
)
on conflict (slug) do nothing;

do $$
declare cid uuid;
begin
  select id into cid from public.training_courses where slug = 'lifting_transfers';
  if cid is not null and not exists (
    select 1 from public.training_quiz_questions where course_id = cid
  ) then
    insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
    (cid, 1,
      'TILE assessment stands for what?',
      '["Time, Intent, Lift, Effort","Task, Individual, Load, Environment","Train, Inspect, Lift, Evaluate","Top, Inside, Lift, Edge"]'::jsonb,
      1,
      'TILE = Task, Individual, Load, Environment — the standard manual-handling risk-assessment framework.'),
    (cid, 2,
      'Before using a ceiling hoist, which of the following is NOT essential to check?',
      '["Battery is charged","Sling is the correct size and undamaged","The colour of the sling matches the room decor","Service sticker is in date"]'::jsonb,
      2,
      'Aesthetics are not a safety factor. Battery, sling integrity/sizing, and service status all are.'),
    (cid, 3,
      'A 78-year-old on warfarin has fallen and hit her head. She wants to get up. What is your action?',
      '["Help her up immediately","Do not move her, call 999/911, reassure and keep warm","Use a sit-to-stand aid","Roll her into recovery position and leave"]'::jsonb,
      1,
      'Anticoagulants + head strike + age >65 = mandatory paramedic assessment. Do not move her.'),
    (cid, 4,
      'You arrive for a shift to find the prescribed hoist is faulty and the person cannot weight-bear. What do you do?',
      '["Lift them with two carers anyway","Use a sit-to-stand aid instead","Refuse the manual lift, escalate, and document","Postpone all care until tomorrow"]'::jsonb,
      2,
      'Refusal is professional. Sit-to-stands require weight-bearing; a manual lift causes injury. Escalate so equipment is fixed urgently.'),
    (cid, 5,
      'When using slide sheets to reposition a person in bed, what is the correct setup?',
      '["One slide sheet, leave it under them after use","Two slide sheets, remove after use","One pillowcase","No sheet — use brute force"]'::jsonb,
      1,
      'Two sheets reduce friction; both must be removed afterwards because a left-in slide sheet is a falls risk.');
  end if;
end $$;

-- ─── 4. cultural_competency ───────────────────────────────────────
insert into public.training_courses
  (slug, title, summary, category, is_required, ceu_credits,
   video_url, video_provider, duration_minutes, country_scope,
   required_for_verticals, sort_order, transcript_md)
values (
  'cultural_competency',
  'Cultural Competency in Care',
  'Respectful care across faiths, languages, dietary needs, family structures, and end-of-life traditions.',
  'behavioural', false, 1.00,
  'https://www.youtube.com/embed/hRiWgx4sHGg', 'youtube', 30, 'both',
  ARRAY[]::text[], 40,
$md$# Cultural Competency in Care

Cultural competency is not memorising customs — it is the habit of asking the person what matters to them and adjusting care accordingly. The single most important skill is **ask, don't assume**.

## 1. Why this matters
A care plan written without attention to faith, food, language, or family structure is technically correct but personally wrong. The person feels unseen, distress goes up, cooperation goes down. Good cultural care reduces incidents, builds trust, and is a fundamental of dignity.

## 2. Faith and prayer
Many traditions have prescribed prayer times (Islam: 5 daily; Judaism: 3 daily; some Christian denominations daily liturgical hours). Ask:
- Are there set times they would like uninterrupted?
- Do they need help with washing/wudu before prayer?
- Is there a direction they'd like to face (Mecca for Muslims; Jerusalem traditionally for Jews)?
- Is there a particular prayer book, rosary, mat, or other item that should be kept accessible?

When a faith leader visits, give them privacy.

## 3. Diet
Common considerations:
- **Halal**: meat slaughtered to Islamic ritual; no pork or pork derivatives; no alcohol (including in cooking, sauces, vanilla extract).
- **Kosher**: separation of meat and dairy; no pork or shellfish; certified ingredients.
- **Hindu**: many are vegetarian; beef is typically avoided across the board.
- **Buddhist**: vegetarianism is common, varies by tradition.
- **Lactose intolerance / lactose-free**: common across many populations and not specifically religious.
- **Vegetarian / vegan**: varied reasons (ethical, religious, health) — respect equally.
- **Allergies / coeliac / diabetes**: medical, not cultural — but the same care in food prep applies.

If you are not sure what counts: ask. If you cannot meet a need, escalate to the family or care coordinator.

## 4. Modesty and same-gender carer requests
Some service users — particularly women in conservative faith traditions, but not only — prefer a same-gender carer for personal care. **This is a reasonable request and should be accommodated wherever possible.** If the request is brought up after assignment, do not be offended — escalate to the coordinator and step back.

For all personal care, regardless of culture: knock, announce, give privacy, only expose what needs to be exposed at any moment.

## 5. Language access
If the person speaks a different first language:
- Use a professional interpreter for any **medical, legal, or consent** conversation. Family members are not professional interpreters and may filter out information they think is upsetting.
- For social conversation, family is fine.
- Many carers speak multiple languages — flag what you speak in your profile so families can request you.
- Translation apps (Google Translate, Apple Translate) are useful for simple needs but never for medication, consent, or safeguarding.

## 6. LGBTQ+ inclusivity
Older LGBTQ+ adults often went through hostile times and may be guarded. Use the names and pronouns the person tells you. Do not assume marital configurations; ask "who's at home with you?" Same-sex partners are next of kin if the person says so. For personal care or end of life, the partner's role is the same as a spouse's.

## 7. End of life and rituals
End-of-life rites vary widely:
- **Catholic**: anointing of the sick, last rites, a priest may be requested.
- **Muslim**: Janazah preparation; the body is washed by family of the same gender; burial within 24 hours where possible.
- **Jewish**: chevra kadisha for body preparation; burial usually within 24–48 hours; no embalming.
- **Hindu**: cremation often within 24 hours; specific prayers; ashes scattered in flowing water.
- **Sikh**: Antam Sanskaar — recitation of prayers; cremation usually within 3 days.

If you don't know — ask the family early, well before the moment. Document the wishes.

## 8. Multi-generational households
Many cultures have multi-generational living as the norm. The decision-maker may be the eldest, an adult child, or the spouse — and is not always the person on the platform's account. Build rapport with the whole household; clarify with the person and key family member who you should update on what.

## 9. Recognise your own bias
We all have unconscious bias. Notice where you make assumptions — about food, family structure, education level, accent, dress, who is in charge of the household. The fact that you noticed makes you better at the work. The fact that you ask makes you trusted.

## 10. When you don't know what to do
Ask the person. "I want to make sure I'm doing this in a way that respects what's important to you. Can you tell me how I should…" Almost no one is offended by a respectful question; most are delighted to be asked.
$md$
)
on conflict (slug) do nothing;

do $$
declare cid uuid;
begin
  select id into cid from public.training_courses where slug = 'cultural_competency';
  if cid is not null and not exists (
    select 1 from public.training_quiz_questions where course_id = cid
  ) then
    insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
    (cid, 1,
      'A new client of yours is a Muslim woman in her 60s. After two visits she asks if she can have a female carer for personal care. What is the right response?',
      '["Tell her she should have asked at booking","Refuse politely and continue","Apologise, accommodate, and escalate to the coordinator","Insist that all SpecialCarer carers are professionals so it doesn''t matter"]'::jsonb,
      2,
      'Same-gender carer requests for personal care are reasonable. Apologise for the discomfort, step back, and let the coordinator find a match.'),
    (cid, 2,
      'You are arranging consent for a medical procedure with a non-English-speaking client. The client''s adult son is fluent in English. What is best practice?',
      '["Use the son to interpret","Use a professional interpreter","Skip consent — it''s only paperwork","Use a translation app for the consent form"]'::jsonb,
      1,
      'Medical consent requires a professional interpreter. Family may filter, soften, or skip clinically important detail.'),
    (cid, 3,
      'A new resident says she is vegetarian. You see this written in her care plan but the kitchen sends meat at lunchtime. What do you do?',
      '["Serve the meat — she must be exaggerating","Send it back, request the correct meal, document the error","Pick the meat off and serve the rest","Eat it yourself and call it lunch"]'::jsonb,
      1,
      'Care plans are followed as documented. Errors are returned to the kitchen and documented so the pattern is fixed.'),
    (cid, 4,
      'A Hindu client is approaching end of life. Which is the most appropriate early step?',
      '["Wait until they pass and ask the family then","Ask the family early about their preferred rites and document them","Assume Christian rites","Avoid the subject entirely"]'::jsonb,
      1,
      'Asking early lets you support the family in the moment without scrambling. Documenting protects continuity if your shift changes.'),
    (cid, 5,
      'You realise you''ve been calling a same-sex partner the client''s "friend" because that''s what came naturally. What is the right next step?',
      '["Keep doing what feels comfortable to you","Apologise privately, use the term they use, update your records","Avoid them both","Make a joke of it"]'::jsonb,
      1,
      'Notice, correct, and use the term the person uses. The partner has the same standing as a spouse if the person says so.');
  end if;
end $$;
