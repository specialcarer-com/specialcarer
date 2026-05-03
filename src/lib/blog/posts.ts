export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string; // ISO date
  author: string;
  category: "Families" | "Caregivers" | "Employers" | "Trust & Safety";
  readingTimeMin: number;
  bodyMd: string;
};

const posts: BlogPost[] = [
  {
    slug: "what-to-ask-a-babysitter-first-time",
    title: "What to ask a babysitter you've never met",
    excerpt:
      "A short checklist of questions worth asking before you hand over the keys for the first time — and what good answers actually sound like.",
    publishedAt: "2026-04-28",
    author: "SpecialCarer Team",
    category: "Families",
    readingTimeMin: 4,
    bodyMd: `Booking a sitter you&rsquo;ve never met is always a leap. A short pre-shift conversation — by message or phone — closes most of the gap.

Here are the questions worth asking, and what a good answer actually sounds like.

## 1. Tell me about a tough moment with a child you&rsquo;ve looked after.

Look for: a real story, told in their own words, where they describe what they did and what they&rsquo;d do differently. Avoid: generic answers (&ldquo;I just stayed calm&rdquo;).

## 2. What would you do if my child wouldn&rsquo;t stop crying?

Look for: a tiered answer — comfort first, distraction, check basic needs, contact you only if it persists. Avoid: jumping straight to &ldquo;I&rsquo;d call you.&rdquo;

## 3. Have you done paediatric first aid recently?

Look for: a specific course name and rough date. Most caregivers re-do this every 1–3 years.

## 4. Are you OK with our screen-time rules / food rules / bedtime routine?

This is more about confirming alignment than testing them. Make your rules clear up front.

## 5. How do you usually get to bookings?

For local sitters this is small talk. For longer drives it&rsquo;s a real reliability check.

## 6. What time will you arrive?

Aim for 10 minutes early. Anyone who tells you they&rsquo;ll &ldquo;cut it close&rdquo; is telling you something useful.

---

A 5-minute message exchange before a first booking is one of the highest-leverage things you can do. If anything feels off, decline — that&rsquo;s exactly what the cancel button is for.`,
  },
  {
    slug: "going-back-to-work-after-maternity",
    title: "Going back to work after maternity leave: a care plan",
    excerpt:
      "A practical structure for thinking through your care arrangements before, during, and after the return-to-work transition.",
    publishedAt: "2026-04-22",
    author: "SpecialCarer Team",
    category: "Families",
    readingTimeMin: 6,
    bodyMd: `The hardest part of returning to work isn&rsquo;t usually the work. It&rsquo;s the choreography around it — pickup times, sick days, school holidays, and the constant sense that any plan is one cough away from collapsing.

Here&rsquo;s a structure that works for most families.

## 1. Map your week before you map your care

Before you book a single hour of care, list:

- Working hours (yours and your partner&rsquo;s)
- Commute time (round trip)
- Required-attendance meetings
- Buffer for late-running days

Then look at the gaps. You&rsquo;re not solving for &ldquo;all care&rdquo; — you&rsquo;re solving for the gaps.

## 2. Decide on your primary arrangement

Most families pick one of:

- Nursery / daycare (predictable, social, but rigid hours and lots of sickness)
- Childminder (more flexible, smaller groups)
- Nanny / nanny-share (most flexible, most expensive)
- Family support (cheapest, hardest to scale)

There&rsquo;s no &ldquo;right&rdquo; answer. The right answer is the one you can sustain for 12 months.

## 3. Build your backup layer

Your backup layer is what catches you when the primary fails. Common backups:

- A trusted ad-hoc sitter (book the same person 3 times before you need them in a crisis)
- Backup-care benefit through an employer
- A nearby family member on standby

This is exactly what SpecialCarer is built for — fast, vetted, ad-hoc cover when your primary arrangement falls through.

## 4. Plan for the first two weeks

The first two weeks back are statistically when most return-to-work plans wobble. Pre-book backup cover for the second week even if you don&rsquo;t think you&rsquo;ll need it. Take the hit on the cost. The mental relief is worth it.

## 5. Tell your manager what you&rsquo;re doing

Not for permission — for visibility. The most common reason returns go badly is when managers find out about your constraints in a crisis instead of a calm conversation.

---

If you&rsquo;d like a vetted, background-checked backup caregiver ready before you go back, [find care now](/find-care).`,
  },
  {
    slug: "how-we-vet-caregivers",
    title: "How we vet caregivers: the long version",
    excerpt:
      "A walk-through of every step in our caregiver verification process — what we check, how we check it, and what we don&rsquo;t.",
    publishedAt: "2026-04-15",
    author: "SpecialCarer Trust & Safety",
    category: "Trust & Safety",
    readingTimeMin: 5,
    bodyMd: `Our short answer is on the [Trust & Safety page](/trust). This is the long version, for anyone who wants to see exactly what happens.

## Step 1: Identity

Before a caregiver can do anything else, they upload a photo of a government-issued ID and complete a real-time selfie capture. We check the document for tampering and run face-match between the ID and the selfie. We also collect a phone number and verify it via SMS.

## Step 2: Background check

UK caregivers complete an Enhanced DBS through our partner uCheck. Depending on the type of work declared, the check includes the Children&rsquo;s and/or Adults&rsquo; Barred List. Results typically come back in 24–72 hours.

US caregivers complete a Checkr screening including SSN trace, national criminal database, county records (typically 7+ years), and the National Sex Offender Registry. Results typically come back in 1–5 business days.

We don&rsquo;t accept self-uploaded background checks. Every check is run through our verified vendor pipeline.

## Step 3: References

Caregivers must provide at least one verifiable reference. We contact references directly — a quick call or email — to confirm the relationship.

## Step 4: Self-declared experience and certifications

Caregivers tell us what they&rsquo;re experienced with — newborn, special-needs, dementia, manual handling, paediatric first aid, etc. They upload certificates where applicable. Certificates are reviewed by our team for legitimacy and currency.

## Step 5: Re-verification

Every 12 months, caregivers re-verify identity and we re-run their background check. Newer certificates need to be uploaded as old ones expire.

## What we don&rsquo;t do

- We do not perform clinical competence assessments. For clinical care needs (PEG feeds, controlled drugs, complex medical needs), specialist agencies are typically a better fit.
- We do not run polygraphs, social-media surveillance, or credit checks. Those tools either don&rsquo;t work or aren&rsquo;t legal where we operate.
- We do not guarantee perfection. Even the most rigorous checks miss things sometimes. That&rsquo;s why we layer on live shift tracking, escrow payments, and a 24/7 trust & safety team.

---

If something ever feels wrong, [contact our team](mailto:safety@specialcarer.com) immediately. We respond to every safety concern within hours.`,
  },
];

export function getAllPosts(): BlogPost[] {
  return [...posts].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
