-- 20260513_training_courses_batch2 — five mandatory UK training courses
--
-- Authors (or enriches existing stubs for) the five highest-value mandatory
-- courses for UK domiciliary care:
--   1. Safeguarding Adults (UK)     — existing stub, enriched
--   2. Safeguarding Children (UK)   — new
--   3. Manual Handling (UK)         — existing stub, enriched
--   4. Basic Life Support (UK)      — new
--   5. Food Hygiene (UK)            — new
--
-- All content authored in-house by SpecialCarer; references CQC, MCA 2005,
-- Care Act 2014, Children Act 1989/2004, MASH, Resuscitation Council UK
-- 2021 guidelines, FSA, HSE MAC tool. 10 case-based quiz questions per
-- course matching the depth of the Medication Administration course.
--
-- This migration is IDEMPOTENT: existing rows are updated (transcript +
-- metadata), quizzes are replaced (delete-then-insert keyed by course_id).
-- Re-running the migration is safe.

-- ---------------------------------------------------------------------------
-- helper: upsert one course by slug, returning its id
-- ---------------------------------------------------------------------------
create or replace function pg_temp.upsert_course(
  _slug text,
  _title text,
  _summary text,
  _category text,
  _ceu numeric,
  _duration int,
  _country text,
  _verticals text[],
  _sort int,
  _required_optin boolean,
  _transcript text
) returns uuid
language plpgsql
as $$
declare
  _id uuid;
begin
  insert into public.training_courses
    (slug, title, summary, category, is_required, ceu_credits,
     duration_minutes, country_scope, required_for_verticals,
     sort_order, video_provider, transcript_md, published_at,
     required_for_agency_optin)
  values
    (_slug, _title, _summary, _category, true, _ceu, _duration, _country,
     _verticals, _sort, 'embed', _transcript, now(), _required_optin)
  on conflict (slug) do update set
    title = excluded.title,
    summary = excluded.summary,
    category = excluded.category,
    is_required = excluded.is_required,
    ceu_credits = excluded.ceu_credits,
    duration_minutes = excluded.duration_minutes,
    country_scope = excluded.country_scope,
    required_for_verticals = excluded.required_for_verticals,
    sort_order = excluded.sort_order,
    transcript_md = excluded.transcript_md,
    required_for_agency_optin = excluded.required_for_agency_optin,
    updated_at = now()
  returning id into _id;

  -- Replace quiz: easier than diffing for content updates
  delete from public.training_quiz_questions where course_id = _id;

  return _id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Safeguarding Adults (UK)
-- ---------------------------------------------------------------------------
do $$
declare cid uuid;
begin
  cid := pg_temp.upsert_course(
    'safeguarding-adults',
    'Safeguarding Adults (UK)',
    'Recognising and responding to abuse and neglect of adults at risk under the Care Act 2014. Covers types of abuse, the Six Safeguarding Principles, Mental Capacity Act, Deprivation of Liberty Safeguards, raising a concern, and your statutory duties.',
    'compliance',
    1.5,
    35,
    'UK',
    array['elderly_care','complex_care','postnatal']::text[],
    20,
    true,
$transcript$
# Safeguarding Adults (UK)

## Why this matters
An *adult at risk* is anyone aged 18 or over who has care and support needs, is experiencing or at risk of abuse or neglect, and cannot protect themselves because of those needs (Care Act 2014, s.42). Most service users you support meet this definition. Spotting and reporting concerns is not optional — it is a statutory duty.

## The Six Safeguarding Principles (Care Act 2014)
1. **Empowerment** — personalised support, informed consent.
2. **Prevention** — act before harm occurs.
3. **Proportionality** — least intrusive response.
4. **Protection** — support and representation for those in greatest need.
5. **Partnership** — local solutions through services working with their communities.
6. **Accountability** — accountability and transparency in delivering safeguarding.

## Types of abuse you must recognise
- **Physical** — hitting, restraint, misuse of medication.
- **Sexual** — non-consensual acts, exposure, harassment.
- **Psychological / emotional** — threats, humiliation, controlling behaviour.
- **Financial / material** — theft, fraud, misuse of benefits, scams.
- **Neglect / acts of omission** — ignoring medical needs, withholding food, hygiene neglect.
- **Self-neglect** — person not maintaining their own health or surroundings.
- **Domestic abuse** — including coercive control.
- **Discriminatory** — based on race, sex, religion, disability, sexuality.
- **Modern slavery** — forced labour, trafficking, servitude.
- **Organisational / institutional** — poor practice across a service.

## Mental Capacity Act 2005 — the five principles
1. Assume capacity unless proved otherwise.
2. Support the person to make their own decision.
3. An unwise decision is not the same as lack of capacity.
4. Decisions for people lacking capacity must be in their **best interests**.
5. Choose the **least restrictive** option.

If a person lacks capacity for a specific decision, a best-interests decision must be documented and involve family, advocates and professionals.

## Deprivation of Liberty Safeguards (DoLS / LPS)
If a person is under continuous supervision and not free to leave, that is a deprivation of liberty and requires authorisation. Never restrict someone informally because "they wander."

## How to raise a safeguarding concern
1. **Make safe** — call 999 if there is immediate danger.
2. **Listen** — believe the person, don't promise confidentiality, don't ask leading questions.
3. **Preserve evidence** — don't wash, don't move things, don't confront the alleged perpetrator.
4. **Record** — facts, exact words in quotes, body language, time, location, who else was present.
5. **Report** — tell your manager immediately AND the local authority adult safeguarding team. If your manager is the alleged abuser, go straight to the local authority or CQC.
6. **Whistleblowing protection** — the Public Interest Disclosure Act 1998 protects you from retaliation when you raise a concern in good faith.

## When in doubt, raise it
You do not need proof to raise a concern. Suspicion based on what you saw, heard or were told is enough. Failure to report is itself a safeguarding failure and may breach CQC Regulation 13.

## Key contacts
- Local authority adult safeguarding team — number kept in your care plan
- CQC: 03000 616161
- Police: 999 (emergency) / 101 (non-emergency)
- Action on Elder Abuse helpline: 080 8808 8141
$transcript$
  );

  insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
  (cid, 1,
   'Under the Care Act 2014, who is an "adult at risk"?',
   '["Anyone aged 65 or over", "Any adult who is unhappy with their care", "An adult who has care and support needs, is experiencing or at risk of abuse or neglect, and cannot protect themselves because of those needs", "Any adult who lives alone"]'::jsonb,
   2,
   'The Care Act 2014, section 42 defines an adult at risk by these three combined criteria. Age alone is not the test.'),
  (cid, 2,
   'You visit a client and find £200 missing from her purse. She says her son took it without asking and she is too scared to challenge him. What type of abuse is this and what is your first action?',
   '["Just family business — not your concern", "Financial abuse — make the client safe, document her exact words, report to your manager and the local authority safeguarding team", "Confront the son next time you see him", "Tell the client to call the police herself"]'::jsonb,
   1,
   'Financial abuse by a family member is one of the most common forms. Your role is to make safe, record verbatim, and escalate — never confront the alleged perpetrator yourself.'),
  (cid, 3,
   'A client with capacity tells you he no longer wants visits from his daughter because she shouts at him. Your manager says "ignore it, it''s a family matter." What should you do?',
   '["Drop it — your manager has decided", "Document the disclosure verbatim and report directly to the local authority safeguarding team or CQC — your duty does not stop because a manager declines to act", "Tell the daughter to be gentler", "Ask the client to prove the shouting first"]'::jsonb,
   1,
   'If your line manager refuses to act on a safeguarding concern, you must escalate externally. Whistleblowing protections under the Public Interest Disclosure Act 1998 cover this.'),
  (cid, 4,
   'Which of these is NOT one of the Six Safeguarding Principles?',
   '["Empowerment", "Punishment", "Proportionality", "Partnership"]'::jsonb,
   1,
   'The six principles are Empowerment, Prevention, Proportionality, Protection, Partnership, Accountability. Punishment is not a safeguarding principle.'),
  (cid, 5,
   'A client with mid-stage dementia refuses to take her arthritis medication today. Her daughter says "just give it to her — she doesn''t know what she''s doing." What is the correct action?',
   '["Give the medicine as the daughter says", "Refuse and document the refusal — capacity must be assessed for THIS specific decision, and any best-interests decision must follow MCA 2005 process with documented plan", "Skip it without telling anyone", "Wait an hour and try again until she takes it"]'::jsonb,
   1,
   'Mental Capacity Act 2005 requires capacity to be assessed for the specific decision. Family cannot override; covert or coerced administration without a documented best-interests decision is unlawful.'),
  (cid, 6,
   'A new client appears underweight, withdrawn and the home is filthy. He lives alone and refuses help with cleaning. What is the most appropriate response?',
   '["Respect his independence and do nothing", "Recognise potential self-neglect; document observations, discuss with your manager, and report to the local authority safeguarding team for a multi-agency response", "Clean the home anyway", "Tell social services he is wasting your time"]'::jsonb,
   1,
   'Self-neglect IS a safeguarding category under the Care Act 2014. Even when a person refuses help, you must record and escalate so a proportionate multi-agency response can be considered.'),
  (cid, 7,
   'A service user discloses sexual abuse by a relative. What must you NOT do?',
   '["Listen without interrupting", "Promise her you will keep it confidential", "Document her exact words", "Report immediately"]'::jsonb,
   1,
   'Never promise confidentiality. You must inform the person you will need to share what they have told you with people who can keep them safe. Honesty maintains trust.'),
  (cid, 8,
   'Under what circumstance is restricting a person''s movement (e.g. locking the door so they cannot leave) potentially lawful?',
   '["Whenever staff feel it is for the person''s safety", "Only when authorised under the Deprivation of Liberty Safeguards (DoLS) or Liberty Protection Safeguards as a best-interests decision following MCA assessment", "Whenever a relative gives permission", "Never under any circumstances"]'::jsonb,
   1,
   'Continuous supervision and not being free to leave amounts to deprivation of liberty and requires formal DoLS / LPS authorisation. Informal restriction "for safety" is unlawful.'),
  (cid, 9,
   'You are told by another carer that a colleague has been rough handling a frail client. You did not witness it. What is the correct action?',
   '["Ignore — you didn''t see it yourself", "Confront the colleague directly", "Treat the report as a safeguarding concern; record exactly what you were told, by whom, with date and time, and report immediately to your manager and the local authority", "Wait until you see it yourself before acting"]'::jsonb,
   2,
   'You do NOT need direct evidence to raise a concern. Disclosures from colleagues must be recorded with attribution and escalated. Failing to act when told is itself a breach.'),
  (cid, 10,
   'After raising a safeguarding concern about her manager, a carer is given the worst shifts and shouted at in front of clients. What protection does she have?',
   '["None — managers can allocate shifts how they like", "The Public Interest Disclosure Act 1998 protects whistleblowers from detriment when concerns are raised in good faith; she can complain to her employer and pursue an Employment Tribunal claim", "She must resign and find a new job", "Only protection is to withdraw the concern"]'::jsonb,
   1,
   'PIDA 1998 makes detriment to whistleblowers unlawful. She can bring a claim to an Employment Tribunal without minimum service requirements where the disclosure relates to qualifying matters including safeguarding.');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Safeguarding Children (UK)
-- ---------------------------------------------------------------------------
do $$
declare cid uuid;
begin
  cid := pg_temp.upsert_course(
    'safeguarding-children',
    'Safeguarding Children (UK)',
    'Recognising and responding to abuse and neglect of children under Working Together to Safeguard Children (2023), the Children Act 1989/2004, and the four categories of harm. Covers signs of abuse, MASH referrals, the duty to record, online safety, and the role of the carer.',
    'compliance',
    1.5,
    35,
    'UK',
    array['childcare','special_needs','postnatal']::text[],
    21,
    true,
$transcript$
# Safeguarding Children (UK)

## Why this matters
Anyone under 18 is a child in UK law (Children Act 1989). Every adult who comes into contact with a child as part of their work has a responsibility to safeguard and promote their welfare. The current statutory framework is **Working Together to Safeguard Children (2023)**.

## The four categories of significant harm
1. **Physical abuse** — hitting, shaking, burning, poisoning, suffocating, fabricated/induced illness.
2. **Emotional abuse** — persistent ill-treatment that causes severe and lasting effects on emotional development (humiliation, terrorising, exploitation, coercion).
3. **Sexual abuse** — forcing or enticing a child into sexual activity, contact or non-contact (including online).
4. **Neglect** — persistent failure to meet basic physical and/or psychological needs (food, clothing, shelter, supervision, medical care, emotional warmth).

## Signs that should raise concern
Bruises in unusual places (the "ears, eyes, mouth, neck, buttocks, genitals, hands, feet" pattern is suspicious in mobile children). Frozen watchfulness. Sexualised behaviour or language outside the child's developmental stage. Failure to thrive without medical explanation. Disclosures from the child. Unexplained injuries with changing or rehearsed-sounding stories. Persistent dirt, hunger, or inappropriate clothing for weather. Children left alone or with unsuitable adults. Excessive bruising in a non-mobile baby is *always* suspicious.

## Contextual safeguarding
Harm can also come from outside the home — peer-on-peer abuse, county lines (drug trafficking exploiting children), criminal exploitation, sexual exploitation, online grooming, radicalisation, FGM, breast ironing, and forced marriage.

## What to do if a child discloses
1. **Stay calm** — your reaction will shape whether they disclose again.
2. **Listen** — let them tell you in their own words. Don't interrupt.
3. **TED prompts only** — "Tell me, Explain, Describe." Never ask leading questions.
4. **Believe them** — false allegations from children are rare.
5. **Don''t promise confidentiality** — tell them you will share with people who can help.
6. **Don''t investigate** — that is the job of social workers and police.
7. **Record verbatim** — exact words, time, place, who else was present.
8. **Report immediately** — to your designated safeguarding lead and/or MASH (Multi-Agency Safeguarding Hub).

## Reporting routes
- **MASH** in the local authority — the front door for child safeguarding referrals.
- **Children''s Social Care** (the local authority duty team) — 24/7.
- **NSPCC adult helpline**: 0808 800 5000.
- **Police**: 999 emergency, 101 non-emergency.
- **CEOP** for online exploitation: report at ceop.police.uk.

If the child or another child is in immediate danger, call 999 first.

## Allegations against staff or volunteers
If a colleague is alleged to have harmed a child, behaved towards a child in a way that indicates they may pose a risk, or committed an offence — the **Local Authority Designated Officer (LADO)** must be informed within 24 hours.

## Information sharing
Data protection is NEVER a reason to withhold information when a child may be at risk. The seven golden rules of information sharing (Working Together 2023) explicitly permit sharing without consent when a child''s safety requires it.

## Children with disabilities
Disabled children are three times more likely to be abused than non-disabled children, partly because of communication barriers. Pay extra attention. Use the child''s preferred communication method.

## Online safety
Treat any concern about online sexual approaches, sexting, sharing of indecent images of children, or radicalisation through online content as urgent safeguarding. CEOP can take down indecent imagery within hours.

## Prevent duty
Under the Counter-Terrorism and Security Act 2015, you have a duty to report concerns that a child is being drawn into terrorism. Refer to the local Prevent team or call the police 101 line.
$transcript$
  );

  insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
  (cid, 1,
   'A 4-month-old baby has unexplained bruising on his cheek. The mother says he hit his face on the cot. What is the correct response?',
   '["Accept the explanation — babies do bump themselves", "Treat as urgent safeguarding — bruising in a non-mobile baby is always suspicious; escalate to MASH/Children''s Social Care immediately", "Take a photo and post it on the team WhatsApp", "Wait to see if more bruises appear"]'::jsonb,
   1,
   'Bruising in a non-mobile baby (under 6 months / not yet rolling) is a recognised red flag for non-accidental injury. Any explanation must be treated with extreme caution and escalated immediately.'),
  (cid, 2,
   'A 7-year-old says quietly "Daddy hurts me when Mum''s at work." How should you respond in the moment?',
   '["Ask leading questions to get more detail", "Promise to keep it secret", "Stay calm, listen without interrupting, use TED prompts (\"Tell me what happens\"), do not promise confidentiality, record her exact words after the conversation, report to your designated safeguarding lead and MASH immediately", "Tell her she must be mistaken"]'::jsonb,
   2,
   'Stay calm, use open prompts, never lead, never promise secrecy, record verbatim, escalate immediately. Investigation is not your role.'),
  (cid, 3,
   'Which of these is NOT one of the four categories of significant harm under Working Together 2023?',
   '["Physical abuse", "Sexual abuse", "Disrespect", "Neglect"]'::jsonb,
   2,
   'The four categories are physical, emotional, sexual, neglect. "Disrespect" is not a category, though emotional abuse covers persistent ill-treatment.'),
  (cid, 4,
   'You are babysitting and a 12-year-old shows you messages from a 30-year-old man met online asking for photos. What should you do?',
   '["Tell the child to block him and forget it", "Treat as urgent safeguarding and child sexual exploitation; preserve the messages (screenshots), inform the parent only if appropriate (not if the parent is the abuser/colluder), report to CEOP and call the police 101 — 999 if immediate risk", "Confront the man yourself online", "Wait to discuss with the parent at end of shift"]'::jsonb,
   1,
   'Online grooming is sexual exploitation. CEOP and police should be informed promptly. Preserve evidence and ensure the child is supported.'),
  (cid, 5,
   'A colleague tells you he saw your manager slap a child during a previous shift. What is your duty?',
   '["Wait until you see it yourself", "Tell the colleague to report it", "Record what you were told verbatim with attribution and report to the Local Authority Designated Officer (LADO) within 24 hours, plus your manager''s manager", "Confront the manager directly"]'::jsonb,
   2,
   'Allegations against staff go to the LADO within 24 hours. Do not investigate; do not confront. A second-hand report is still a duty to escalate.'),
  (cid, 6,
   'A 5-year-old in your care comes to nursery wearing a thin t-shirt in freezing weather, hasn''t eaten since the day before, and smells of urine. The mother seems exhausted. What category is this and what is the response?',
   '["Not safeguarding — just a busy mum", "Neglect; record observations, raise with your safeguarding lead the same day, and consider an early help / MASH referral", "Lend the child clothes and say nothing", "Buy them food but don''t document it"]'::jsonb,
   1,
   'Persistent failure to meet basic needs (warmth, food, hygiene) is neglect. Documentation and a same-day safeguarding conversation are required; early help may be appropriate before formal referral.'),
  (cid, 7,
   'You are told that data protection means you cannot share information about a child without parental consent. Is this correct?',
   '["Yes — never share without consent", "Correct unless the child agrees", "No — the seven golden rules of information sharing make clear that you can and must share without consent when a child''s safety requires it; data protection is not a barrier to safeguarding", "Only with a court order"]'::jsonb,
   2,
   'GDPR and the Data Protection Act 2018 explicitly permit sharing for safeguarding without consent where the child is at risk. Working Together 2023 reinforces this.'),
  (cid, 8,
   'A teenager you support starts repeating extremist views and says he has been talking online to someone who plans an attack. What duty applies and what do you do?',
   '["Free speech — none of your business", "The Prevent duty under the Counter-Terrorism and Security Act 2015 applies; refer to the local Prevent team or call the police 101 line immediately. If there is imminent risk, call 999", "Wait to see if anything happens", "Talk him out of it yourself"]'::jsonb,
   1,
   'Prevent duty obliges you to refer concerns about radicalisation. Imminent threats go to 999; otherwise the Prevent team or 101.'),
  (cid, 9,
   'A child with significant learning disabilities is unable to tell you in words that something is wrong but becomes very distressed when a specific family friend visits. What should you do?',
   '["Ignore — she can''t tell you what''s wrong", "Behavioural change in a child who cannot verbally disclose is a recognised indicator; document carefully, escalate to your safeguarding lead, request a multi-agency assessment with disability-appropriate communication support", "Just keep her away from the visitor without telling anyone", "Ask the family friend if there''s a problem"]'::jsonb,
   1,
   'Disabled children are three times more likely to be abused. Non-verbal distress signals must be taken as seriously as verbal disclosures. Multi-agency input with appropriate communication support is essential.'),
  (cid, 10,
   'You report a safeguarding concern to MASH. You don''t hear back for three days. What is the correct action?',
   '["Assume it''s been handled", "Drop it — you did your bit", "Follow up in writing within 3 working days if you have not received a response; escalate to children''s social care duty team and your own manager if no action appears to be taken — the child remains your concern until you have evidence of action", "Stop reporting things to MASH in future"]'::jsonb,
   2,
   'A referral is the start, not the end. Working Together 2023 requires the referrer to follow up if no feedback is received within 3 working days, and to escalate further if a child appears to remain at risk.');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Manual Handling (UK)
-- ---------------------------------------------------------------------------
do $$
declare cid uuid;
begin
  cid := pg_temp.upsert_course(
    'manual-handling',
    'Manual Handling (UK)',
    'Safe moving and handling of people and loads under the Manual Handling Operations Regulations 1992 (as amended). Covers the TILE/TILEO assessment, the HSE MAC tool, equipment use (hoists, slide sheets, transfer boards), and what to do when handling cannot be avoided.',
    'clinical',
    1.5,
    35,
    'UK',
    array['elderly_care','complex_care','postnatal','special_needs']::text[],
    22,
    true,
$transcript$
# Manual Handling (UK)

## Why this matters
Musculoskeletal injuries are the single largest cause of work-related ill health in care. Bad lifting techniques cause life-changing back, neck and shoulder damage in carers, AND injuries to the people you support. The Manual Handling Operations Regulations 1992 (as amended) give you legal protections — and impose duties.

## The legal hierarchy (MHOR 1992)
1. **Avoid** — if a task can be done without manual handling, do it that way.
2. **Assess** — where handling can''t be avoided, assess the risk.
3. **Reduce** — reduce the risk to the lowest reasonably practicable level.

Your employer must provide training, equipment and assessments. You must follow them.

## The TILE / TILEO assessment
- **T**ask — what is being moved, how far, how often?
- **I**ndividual — what is the carer''s capability, training, health?
- **L**oad — weight, size, stability, person''s mobility, cooperation, dignity needs.
- **L**oad / **E**nvironment — space, lighting, flooring, obstacles, temperature.
- **O** (TILEO) — **O**ther factors: PPE, clothing, time pressure, equipment availability.

For each handling task you do, you should be able to answer these in seconds — it''s a mental checklist.

## Hierarchy of safe transfer
1. The person moves themselves (encouragement, time, prompting).
2. The person moves themselves with assistive equipment (frame, transfer board, slide sheet, grab rail).
3. The person is hoisted (sit-to-stand or full hoist).
4. Two-carer transfers using equipment.
5. Manual handling of the person — **last resort and only as documented in the moving and handling plan.**

## Never-use techniques
- Drag lift / underarm lift (causes shoulder dislocation — banned).
- Australian / shoulder lift (banned).
- Bear hugs to lift.
- Pulling on a person''s arm to stand them.

## Hoists
- Check the **safe working load (SWL)** on hoist AND sling.
- Inspect sling for wear, frayed straps, missing tags, dirt, stains.
- Match sling type (transfer / standing / toileting) to the task and the documented plan.
- Two carers required unless the manufacturer and plan say otherwise.
- Never leave a person suspended in a hoist unattended.
- Stop immediately and document if there is **LOLER** equipment with no current six-monthly inspection.

## Lifting loads (not people)
For objects/loads, follow HSE guidance:
- Plan the lift — route clear?
- Adopt a stable position — feet apart, one slightly forward.
- Get a good hold — close to the body.
- Keep back straight — bend knees not back.
- Don''t twist — turn with your feet.
- Don''t lift higher than necessary.
- Put down then adjust position.

For loads above 25 kg for men or 16 kg for women at waist height, the HSE **MAC (Manual Handling Assessment Charts)** tool puts the task in red zone — get help, use equipment, split the load.

## When something is wrong
- Equipment overdue inspection — **stop**, report, document.
- Person''s mobility has changed — **stop**, ask for a re-assessment before continuing the old plan.
- You are alone but the plan needs two — **don''t do it**, contact the office.
- You injure yourself — RIDDOR reportable if you are off for over 7 days.

## Your right to refuse
You have a legal right under MHOR 1992 to refuse a task that puts your safety at risk. You cannot be lawfully disciplined for refusing where a genuine and reasonable risk exists.
$transcript$
  );

  insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
  (cid, 1,
   'What does the "L" in the TILE assessment stand for?',
   '["Lifting", "Load and the person''s individual characteristics", "Location", "Length"]'::jsonb,
   1,
   'L = Load (the person or object being moved, including their cooperation and mobility). TILE: Task, Individual, Load, Environment. TILEO adds Other.'),
  (cid, 2,
   'You arrive at a client''s home. The care plan says she walks with a frame, but today she says she is dizzy and her legs won''t take her weight. The plan says one carer, no hoist. What do you do?',
   '["Help her up anyway — the plan says one carer", "Stop; the change in mobility invalidates the existing plan. Contact the office, request a re-assessment, and use hoisting equipment or a second carer in the meantime", "Drag her gently to the chair", "Tell her to sleep on the floor"]'::jsonb,
   1,
   'A change in the person''s capability invalidates the existing handling plan. MHOR requires a fresh assessment before continuing. Do not improvise an unsafe transfer.'),
  (cid, 3,
   'Which of these is BANNED in UK care?',
   '["Slide sheet", "Transfer board", "Underarm / drag lift", "Mobility frame"]'::jsonb,
   2,
   'The underarm (drag) lift causes shoulder dislocation and is banned. The Australian / shoulder lift is also banned. Slide sheets, transfer boards and frames are all approved.'),
  (cid, 4,
   'You notice the hoist''s LOLER inspection sticker expired two months ago. The client needs to be hoisted to use the toilet now. What is the correct action?',
   '["Use it anyway — it will probably be fine", "Stop, do not use the hoist, contact the office to arrange immediate inspection, use a documented alternative (commode at bedside, or second carer with safe alternative) and report the lapse in writing", "Use it only this once", "Use it without the inspection sticker"]'::jsonb,
   1,
   'LOLER (Lifting Operations and Lifting Equipment Regulations 1998) requires six-monthly inspection for equipment used to lift people. Out-of-date inspection makes the equipment unsafe to use; do not use.'),
  (cid, 5,
   'A 95kg gentleman has fallen and is sitting on the floor uninjured. He cannot get up himself. The plan says use the inflatable lifting cushion. You are alone. What do you do?',
   '["Try to lift him with a bear hug", "Pull on his arms to get him upright", "Follow the plan — call the second carer to attend, use the inflatable cushion as per its instructions, do NOT attempt to lift him manually alone", "Ask him to crawl to a chair"]'::jsonb,
   2,
   'A fallen person who is uninjured should be raised using equipment (inflatable cushion, hoist) — never by manual lift. If the plan says two carers, that is the correct number and a single carer must wait or use an alternative.'),
  (cid, 6,
   'Which one of the following is NOT a step in the legal hierarchy of manual handling under MHOR 1992?',
   '["Avoid manual handling where reasonably practicable", "Assess the risk where it can''t be avoided", "Reduce the risk to the lowest reasonably practicable level", "Accept the risk and proceed"]'::jsonb,
   3,
   'MHOR sets out Avoid → Assess → Reduce. There is no "accept and proceed" — handling is only done when it is the least-risk option after avoidance and reduction.'),
  (cid, 7,
   'A client''s sling has a small frayed strap. The schedule is tight and the next visit is starting. Do you continue with the hoist?',
   '["Yes, time pressure justifies it", "Yes, if you go slowly", "No — a sling with damage must not be used; isolate it, report it, use the documented alternative or contact the office", "Yes, if the client agrees"]'::jsonb,
   2,
   'Damaged slings can fail catastrophically. Time pressure and consent do not make an unsafe sling safe. Always isolate damaged equipment.'),
  (cid, 8,
   'You are lifting a 25kg shopping bag from the boot of a car. What is the SAFEST technique?',
   '["Bend at the waist with straight legs and lift quickly", "Bend the knees, keep the back straight, get a good grip close to the body, lift smoothly without twisting", "Lift with one hand only", "Throw the bag from the boot onto your shoulder"]'::jsonb,
   1,
   'The HSE-recommended technique: stable feet, bend knees not back, load close to body, no twisting. This protects the lumbar spine and shoulders.'),
  (cid, 9,
   'You injure your back during a lift and are off work for 9 days. Is this RIDDOR reportable, and by whom?',
   '["No — it''s a minor injury", "Yes — your employer must report it to HSE under RIDDOR as it caused absence over 7 days", "Only if you go to hospital", "Only if you have a witness"]'::jsonb,
   1,
   'RIDDOR requires the employer to report work-related injuries causing more than 7 days incapacity. The duty is on the employer, not the worker.'),
  (cid, 10,
   'Your manager insists you do a single-carer hoist with a person whose plan clearly says "two carers required." You refuse. Can you be disciplined?',
   '["Yes — your manager''s instruction overrides the plan", "No — under MHOR 1992 and the Health and Safety at Work Act 1974 you have a legal right to refuse work that puts you or the service user at risk; disciplining you for that refusal is unlawful detriment", "Only if you refuse twice", "Only if the client complains"]'::jsonb,
   1,
   'You cannot be lawfully disciplined for refusing a task that contravenes the moving and handling plan. Your safety AND the service user''s safety are protected by statute.');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Basic Life Support (UK)
-- ---------------------------------------------------------------------------
do $$
declare cid uuid;
begin
  cid := pg_temp.upsert_course(
    'basic-life-support',
    'Basic Life Support (UK)',
    'Adult, paediatric and infant BLS based on Resuscitation Council UK 2021 guidelines. Covers the DRSABCD primary survey, CPR ratios for adult/child/infant, AED use, recovery position, choking, and seizure management.',
    'clinical',
    2.0,
    45,
    'UK',
    array['elderly_care','childcare','complex_care','postnatal','special_needs']::text[],
    23,
    true,
$transcript$
# Basic Life Support (UK)

## Why this matters
The single most important factor in surviving cardiac arrest is the bystander who acts. Survival drops by 10% for every minute without CPR. You can keep someone alive until paramedics arrive — and that "someone" might be the person you care for.

This module reflects **Resuscitation Council UK 2021 guidelines**.

## DRSABCD — the primary survey
- **D** — Danger. Make the scene safe before approaching.
- **R** — Response. Shout, gently shake the shoulders, ask loudly.
- **S** — Shout for help / send for help. Dial 999 (or 112). On a UK mobile, dial 999 — the operator will stay on the line and guide you.
- **A** — Airway. Tilt head, lift chin. For infants, neutral position.
- **B** — Breathing. Look, listen, feel for 10 seconds. Agonal gasps are NOT normal breathing.
- **C** — Circulation / CPR. Begin chest compressions.
- **D** — Defibrillation. Get an AED if available.

## Adult CPR (over puberty)
- Compression depth: **5–6 cm**.
- Compression rate: **100–120 per minute** (think "Stayin'' Alive" by the Bee Gees or "Nellie the Elephant").
- Ratio: **30 compressions : 2 rescue breaths**, continuously.
- If you can''t / won''t do rescue breaths, do **continuous chest compressions** (still effective).
- Allow full chest recoil between compressions.
- Minimise interruptions. Swap rescuer every 2 minutes if possible.

## Paediatric CPR (child age 1 to puberty)
- 5 initial rescue breaths.
- Depth: at least **1/3 of chest depth** (~5 cm).
- Rate: 100–120/min.
- Ratio: **15 compressions : 2 rescue breaths** (one rescuer can use 30:2 if untrained in paediatric).
- One-handed compressions for smaller children.

## Infant CPR (under 1 year)
- 5 initial rescue breaths.
- Use **two fingers** (single rescuer) or **two thumbs encircling** (two rescuers).
- Depth: ~4 cm (1/3 of chest depth).
- Rate: 100–120/min.
- Ratio: **15:2**.

## AED — Automated External Defibrillator
- Switch it on and follow voice prompts. The AED will not shock unless a shockable rhythm is detected — it is safe.
- Pads: one upper right chest below the collarbone, one on the left side under the armpit on the chest wall. For infants/children under 8, use paediatric pads if available, in anterior-posterior position (front-back).
- Don''t stop chest compressions while pads are applied. Stop only when the AED says "analysing — do not touch the patient."
- Wet chest: dry it. Hair: shave if necessary. Pacemaker bulge: avoid the bulge. Medication patch: remove. Metal jewellery: remove from chest area.

## Recovery position
For an unresponsive person who IS breathing normally. Roll onto their side, top leg bent, head tilted back so the airway stays open. Check breathing every minute. Move to other side after 30 minutes to prevent pressure damage.

## Choking
**Effective cough** — encourage to keep coughing.

**Ineffective cough, conscious adult/child:**
- 5 back blows between shoulder blades.
- 5 abdominal thrusts (Heimlich) — NOT for infants or pregnant women.
- Repeat.

**Conscious infant choking:**
- 5 back blows (face down on your forearm, head lower than chest).
- 5 chest thrusts (turn over, two fingers on the lower sternum).
- Repeat. Never use abdominal thrusts on an infant.

**If they become unconscious:** lower carefully to ground, call 999, start CPR.

## Seizures
- Do NOT restrain.
- Do NOT put anything in their mouth.
- Cushion the head, remove glasses, time the seizure.
- Recovery position when it stops.
- 999 if: first ever seizure, lasts over 5 minutes, repeated seizures, injury, difficulty breathing after, or person is pregnant.

## After the event
- Hand over clearly to paramedics: what happened, when, what you''ve done, any observations.
- Stay until clinical handover.
- Speak to your manager. Debriefs and emotional support exist for a reason — performing CPR is hard.
$transcript$
  );

  insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
  (cid, 1,
   'You find your client unresponsive. After making the scene safe, what is the immediate next step (DRSABCD)?',
   '["Start chest compressions immediately", "Check for breathing first, before doing anything else", "Check for response — shout, gently shake shoulders, ask loudly", "Call her family"]'::jsonb,
   2,
   'After D (Danger), R is Response. You must establish unresponsiveness before progressing. Skipping straight to compressions on a sleeping or fainted person is wrong; equally, delaying compressions on an unresponsive non-breather is wrong.'),
  (cid, 2,
   'For an unresponsive adult who is not breathing normally (or only gasping), what is the correct compression depth and rate?',
   '["3–4 cm at 60 bpm", "5–6 cm at 100–120 bpm", "8 cm at 80 bpm", "Whatever feels right"]'::jsonb,
   1,
   'Resuscitation Council UK 2021: depth 5–6 cm, rate 100–120 per minute. Tip: "Stayin'' Alive" is 103 bpm. Too shallow gives no perfusion; too deep risks rib fractures and reduced cardiac output.'),
  (cid, 3,
   'Agonal gasps in an unresponsive person mean:',
   '["They are breathing — do not start CPR", "They are NOT breathing normally — start CPR", "They are choking", "They are dreaming"]'::jsonb,
   1,
   'Agonal gasps are common in the first minutes of cardiac arrest and are NOT effective breathing. They are an indication to start CPR, not to delay it.'),
  (cid, 4,
   'A 6-year-old child has stopped breathing. What is the CPR sequence per RC UK 2021?',
   '["30 compressions : 2 breaths, no initial breaths", "5 rescue breaths first, then 15 compressions : 2 breaths", "Continuous compressions only", "Mouth-to-mouth only"]'::jsonb,
   1,
   'Paediatric BLS opens with 5 rescue breaths because most paediatric arrests are hypoxic in origin, then 15:2. (A lone rescuer untrained in paediatric may default to adult 30:2 — that''s acceptable.)'),
  (cid, 5,
   'You are about to attach an AED. The client''s chest is sweaty and she has a glyceryl trinitrate (GTN) patch on her upper left chest. What is the correct sequence?',
   '["Place pads over the patch and dry the chest later", "Dry the chest, remove the GTN patch and wipe off any residue, then attach pads in standard positions", "Attach pads anywhere — the AED works through patches", "Do not use the AED — too risky"]'::jsonb,
   1,
   'Medication patches must be removed (they can ignite under defibrillation and prevent good pad contact). Wet chest must be dried for adhesion and conduction safety. Then standard pad placement.'),
  (cid, 6,
   'An infant aged 6 months is choking and coughing weakly. What is the FIRST treatment?',
   '["Abdominal thrusts (Heimlich)", "Stick fingers in his mouth to fish out the object", "5 back blows with the infant face-down along your forearm, head lower than chest", "Wait and watch"]'::jsonb,
   2,
   'Infants get back blows first (face down, head lower than chest), then 5 chest thrusts. NEVER abdominal thrusts on an infant — risk of liver/spleen damage.'),
  (cid, 7,
   'Your client is in the recovery position after fainting. How often should you check her breathing?',
   '["Every 10 minutes", "Once at the start, then leave her", "Every minute", "Only when the paramedic arrives"]'::jsonb,
   2,
   'Continuous monitoring is essential. Recheck every minute. After 30 minutes, gently roll to the other side to prevent pressure damage.'),
  (cid, 8,
   'Which of these is a 999-criterion during or after a seizure?',
   '["The seizure lasts 30 seconds", "The person is a known epileptic having their usual pattern of seizure with no injury", "The seizure lasts longer than 5 minutes, OR is the person''s first seizure, OR seizures repeat without recovery, OR there is injury, breathing difficulty or pregnancy", "All of the above"]'::jsonb,
   2,
   'Status epilepticus (>5 min) is a medical emergency. So are first-ever seizures, repeated seizures, injuries, breathing problems, and seizures in pregnancy. Routine epileptic seizures in someone known to have epilepsy often don''t need 999, depending on their plan.'),
  (cid, 9,
   'During CPR you become exhausted after 90 seconds and there is a second trained person present. What should you do?',
   '["Push through — never stop", "Stop CPR completely for a minute", "Swap rescuer quickly to maintain compression quality, aiming to minimise pause in compressions to a few seconds", "Restart from the beginning"]'::jsonb,
   2,
   'Compression quality drops rapidly with fatigue. Swap every 2 minutes (or sooner if exhausted) to maintain quality. Minimise the pause — aim for under 5 seconds.'),
  (cid, 10,
   'A paramedic arrives. What information must you hand over?',
   '["Nothing — they''ll figure it out", "Just the client''s name", "What happened (collapsed at X time), what you have done (CPR for N minutes, shocks delivered if any), known medical history, current medications and DNACPR status if known", "Just that you tried CPR"]'::jsonb,
   2,
   'A clinical handover (sometimes called SBAR or ATMIST) gives the paramedic critical information: time of collapse, interventions, history, meds, and any DNACPR. Hidden DNACPR documents can lead to inappropriate resuscitation continuing.');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Food Hygiene (UK)
-- ---------------------------------------------------------------------------
do $$
declare cid uuid;
begin
  cid := pg_temp.upsert_course(
    'food-hygiene',
    'Food Hygiene (UK)',
    'Level 2 Food Hygiene for care settings under the Food Safety Act 1990, Food Hygiene (England) Regulations 2006, and FSA guidance. Covers the four Cs (Cross-contamination, Cleaning, Chilling, Cooking), allergens, fridge temperatures, modified-texture diets and choking risk, and personal hygiene.',
    'clinical',
    1.0,
    30,
    'UK',
    array['elderly_care','childcare','postnatal','special_needs','complex_care']::text[],
    24,
    true,
$transcript$
# Food Hygiene (UK)

## Why this matters
Older people, babies and immunocompromised adults are far more vulnerable to food poisoning. Salmonella, E. coli O157, Listeria, Campylobacter and norovirus all kill — and your kitchen practices are often the only line of defence in a domestic care setting.

This module is **Level 2 Food Hygiene** aligned with Food Standards Agency (FSA) guidance and the Food Safety Act 1990.

## The four Cs
1. **Cross-contamination** — keeping raw and cooked apart.
2. **Cleaning** — wash hands, work surfaces, utensils.
3. **Chilling** — keep cold things cold.
4. **Cooking** — kill bacteria with heat.

## Cross-contamination
- Separate boards / utensils for raw meat and ready-to-eat.
- Raw meat on the BOTTOM shelf of the fridge (so blood can''t drip onto anything below).
- Never use the same knife for raw chicken and salad without washing.
- Wash hands between raw and ready-to-eat handling.
- Tea towels are a known route — change daily.

## Cleaning
- Hot soapy water then sanitiser, or a 2-in-1 sanitising spray that meets BS EN 1276 or BS EN 13697.
- Surfaces, equipment, taps, fridge handles, bin lids, can openers.
- Wash hands: arrival, before food prep, after raw meat, after toilet, after coughing/sneezing/blowing nose, after handling rubbish or pets.

## Chilling
- Fridge: **0–5 °C** (aim 3 °C).
- Freezer: **-18 °C or below**.
- Cool cooked food quickly (within 1–2 hours), refrigerate, eat within 48 hours or freeze.
- Use a fridge thermometer. Stickered "fridge temperature checked at X time" is good practice.
- Never thaw at room temperature — thaw in the fridge or microwave.

## Cooking
- Core temperature **75 °C for 30 seconds** OR equivalent (70 °C for 2 minutes; 80 °C for 6 seconds).
- Reheat ONCE only to 75 °C or above.
- Eggs: yolk and white firm for vulnerable people (under-fives, over-65s, pregnant, immunocompromised). Lion-marked eggs may be eaten soft for the general healthy population but **NOT for vulnerable groups**.
- Probe thermometer: clean and calibrate.

## Allergens — the legal 14
Cereals containing gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, tree nuts, celery, mustard, sesame, sulphur dioxide / sulphites, lupin, molluscs.

You must:
- Ask before preparing food for a new client.
- Read every label, every time — recipes change.
- Keep allergens physically separated from preparation areas.
- Never improvise a "free-from" version — guess wrong and the person dies.
- Document a known allergy in the care plan, and check before every meal.

The Anaphylaxis chapter of FSA guidance is mandatory reading. "Natasha''s Law" (2021) requires full allergen labelling for pre-packaged-for-direct-sale food.

## Modified-texture diets (IDDSI)
Service users with dysphagia have texture-modified diets per the International Dysphagia Diet Standardisation Initiative (IDDSI). The levels are 0–7. Wrong texture = aspiration pneumonia, choking, death.
- Always check the care plan / SaLT report for the prescribed IDDSI level.
- Use the **flow test** or **fork drip test** as relevant.
- Never assume "soft" or "mashed" is enough — texture is prescribed precisely.

## Choking risk foods (NHS England guidance)
For older adults with swallowing difficulties, avoid: whole grapes, cherry tomatoes, popcorn, raw carrot, marshmallows, large chunks of dry meat, sticky bread.

## Personal hygiene
- Tie hair back, no jewellery (plain wedding band allowed).
- Cover cuts with blue waterproof plaster (blue so it''s visible if it falls into food).
- No nail polish or false nails.
- Clean apron / uniform.
- Don''t work if you have diarrhoea or vomiting; stay off for 48 hours after symptoms stop.

## The fridge inventory
- Date everything when opened.
- Throw away after the "use by" date.
- "Best before" is quality, not safety, but vulnerable clients should not eat past use-by.
- Cooked food: 2 days max in the fridge for vulnerable clients.

## What to do if food poisoning is suspected
- Document the symptoms, the food, the timing.
- Inform the manager and the GP.
- Notifiable diseases (Listeria, Hepatitis A, certain E. coli, Salmonella) must be reported to UKHSA / Public Health.
- If multiple service users in one home are affected, treat as an outbreak — call the FSA and the local Environmental Health team.

## Records
Document what was prepared, when, who ate it, fridge temps, and any incidents. In an outbreak investigation, your records are the difference between explained and unexplained.
$transcript$
  );

  insert into public.training_quiz_questions (course_id, sort_order, prompt, options, correct_index, explanation) values
  (cid, 1,
   'What is the correct fridge temperature range?',
   '["10–15 °C", "0–5 °C", "minus 18 °C", "20 °C is fine if door stays shut"]'::jsonb,
   1,
   'A domestic / care fridge must be 0–5 °C (aim for 3 °C). At 10 °C bacteria multiply rapidly. -18 °C is freezer territory.'),
  (cid, 2,
   'You are storing groceries. Where should raw chicken go?',
   '["Top shelf, so it''s easy to see", "Anywhere in the fridge", "Bottom shelf, in a sealed container, so juices cannot drip onto anything below", "On the counter, it''ll cook tonight"]'::jsonb,
   2,
   'Raw meat always goes on the bottom shelf, sealed, to prevent juices contaminating ready-to-eat foods stored below or on the same level.'),
  (cid, 3,
   'A client is allergic to peanuts. You are making her a sandwich and the loaf of bread has a "may contain nuts" label. What do you do?',
   '["Use it — ''may contain'' is just a precaution", "Open the loaf and check inside", "Do not use it; ''may contain'' warnings indicate possible cross-contamination and must be treated as containing the allergen for an allergic client. Use a guaranteed nut-free product", "Ask the client if she minds"]'::jsonb,
   2,
   '"May contain" labels are legally meaningful precautionary warnings. For an allergic person they mean the food is unsafe. Anaphylaxis can be fatal.'),
  (cid, 4,
   'You have made a casserole. The client has eaten some. The leftovers need to be cooled and stored. What is the correct method?',
   '["Leave on the counter until cool, then refrigerate", "Cool quickly within 1–2 hours, refrigerate at 0–5 °C, eat within 48 hours or freeze", "Refrigerate while still hot", "Leave in the oven overnight"]'::jsonb,
   1,
   'The "danger zone" is 8–63 °C. Cool quickly (within 1–2 hours, e.g. portion into shallow containers, ice bath, cold-water bath) and chill. Hot food in the fridge raises the temperature of everything else.'),
  (cid, 5,
   'A client has dysphagia and her care plan says IDDSI Level 4 (puréed). The kitchen has only mashed potato and gravy. What should you do?',
   '["Serve the mashed potato — close enough", "Check whether mashed potato actually passes the IDDSI Level 4 fork-drip test; if not, do not serve a wrong-texture meal — aspirating risks pneumonia or death; offer a safe alternative and document", "Pour gravy over so it''s easier to swallow", "Ask her to eat it slowly"]'::jsonb,
   1,
   'Wrong-texture food can be fatal. IDDSI levels are prescribed precisely. Wet mashed potato may meet Level 5 but typically NOT Level 4. The fork-drip test confirms. When in doubt, offer something you know is safe and escalate.'),
  (cid, 6,
   'You have a small cut on your finger. What is the correct precaution before preparing food?',
   '["Skip food prep today", "Cover with a blue waterproof plaster, AND wear a disposable glove for raw food handling", "Cover with any plaster colour", "Wash and ignore"]'::jsonb,
   1,
   'Blue plasters are used because the colour is foreign to most foods and easily spotted if one falls in. Gloves provide additional protection for ready-to-eat handling.'),
  (cid, 7,
   'You vomited last night. You feel fine now but are due in for a shift at a vulnerable adult''s home this morning. What is the FSA rule?',
   '["Go in as planned if you feel better", "Stay off for 48 hours after the last symptom", "Stay off for 24 hours", "Wear a mask and go in"]'::jsonb,
   1,
   'Food handlers must stay off duty for 48 hours after the LAST symptom of diarrhoea or vomiting. Norovirus and other agents are shed for days after symptoms stop.'),
  (cid, 8,
   'A leftover pasta dish from two days ago is in the fridge. The client wants to eat it. The fridge has been at 4 °C and the pasta was correctly cooled. What temperature should you reheat to?',
   '["Until warm to touch", "75 °C core temperature for 30 seconds, and only reheat ONCE", "Heat until boiling for 30 minutes", "Microwave 1 minute"]'::jsonb,
   1,
   'Reheat to 75 °C core or equivalent (70/2 min, 80/6 sec), and only once. Repeated reheating allows bacteria to multiply between cycles.'),
  (cid, 9,
   'Which of these is one of the 14 legally-declarable allergens in the UK?',
   '["Strawberry", "Sesame", "Tomato", "Apple"]'::jsonb,
   1,
   'The 14: cereals with gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, tree nuts, celery, mustard, sesame, sulphites, lupin, molluscs. Strawberries, tomatoes and apples are common allergens for individuals but are not on the legal list.'),
  (cid, 10,
   'You are caring for an 86-year-old recovering from surgery. She fancies a soft-boiled egg with runny yolk. What should you do?',
   '["Make it as she asked — soft yolk is fine", "Refuse, and explain: vulnerable people (over-65, under-5, pregnant, immunocompromised) should only eat eggs with firm whites and yolks regardless of the Lion mark", "Make it if she signs a disclaimer", "Use a duck egg instead"]'::jsonb,
   1,
   'FSA guidance is clear: vulnerable groups should only eat eggs with fully firm whites and yolks. Salmonella risk in soft eggs is small for the healthy general population but materially higher consequences for vulnerable individuals.');
end $$;

-- ---------------------------------------------------------------------------
-- final verification (optional — informational only, doesn't fail the migration)
-- ---------------------------------------------------------------------------
do $$
declare
  expected text[] := array['safeguarding-adults','safeguarding-children','manual-handling','basic-life-support','food-hygiene'];
  missing int;
  empty_quiz int;
begin
  select count(*) into missing
  from unnest(expected) s(slug)
  where not exists (select 1 from public.training_courses c where c.slug = s.slug);

  select count(*) into empty_quiz
  from public.training_courses c
  where c.slug = any(expected)
    and (select count(*) from public.training_quiz_questions q where q.course_id = c.id) = 0;

  if missing > 0 then
    raise warning 'batch2: % course(s) missing after migration', missing;
  end if;
  if empty_quiz > 0 then
    raise warning 'batch2: % course(s) have no quiz questions after migration', empty_quiz;
  end if;
end $$;
