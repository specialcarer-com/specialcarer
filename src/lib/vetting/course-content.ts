/**
 * Onboarding course modules. Each module has a body the carer must
 * read, a single knowledge-check question, and the correct option.
 * Content is UK-and-US neutral with explicit country callouts where the
 * answer differs between jurisdictions.
 *
 * IMPORTANT: this content is the platform's training baseline, not
 * legal advice. Carers must defer to local protocols, employer rules,
 * and statutory guidance in their jurisdiction.
 */

import type { CourseModule } from "./types";

export const COURSE_MODULES: readonly CourseModule[] = [
  {
    key: "safeguarding_adults",
    title: "Safeguarding Adults",
    summary:
      "What adult abuse looks like, how to spot it, and how to act on a concern.",
    bodyMarkdown: `Safeguarding adults means protecting people aged 18+ who, because of age, illness, disability or other circumstances, may not be able to protect themselves from abuse or neglect. As a SpecialCarer, you are usually the closest professional to your client — you may be the first to notice that something is wrong.

Adult abuse takes many forms: **physical** (unexplained bruises, frequent injuries), **psychological** (fear, withdrawal, sudden change in mood), **financial** (missing money, sudden changes to bills), **sexual**, **neglect** (poor hygiene, weight loss, untreated medical needs), **discriminatory**, **domestic**, and **organisational**.

Listen carefully if a client tries to tell you something. Do not promise confidentiality — you may have to share what you've been told. Do not investigate yourself, and do not confront a suspected abuser. Keep the person safe right now, and report.

In the **UK**, report concerns to your local authority's Adult Safeguarding hub (every council has one) and to SpecialCarer's trust and safety team via the in-app SOS or by emailing hello@specialcarer.com. If the person is in immediate danger, call **999**.

In the **US**, report to the relevant state's Adult Protective Services (APS) and to SpecialCarer. If the person is in immediate danger, call **911**.

Always document what you saw, when, and what was said in the carer journal — facts only, your opinions go in private notes. Never delete or edit the original entry. SpecialCarer will support you through any subsequent investigation.`,
    question:
      "A client whispers that their adult son is shouting at them and taking their bank card. What do you do first?",
    options: [
      "Promise the client you'll keep it secret so they trust you.",
      "Confront the son directly when he comes home.",
      "Make sure the client is safe right now, then report to your local Adult Safeguarding hub (UK) or APS (US) and SpecialCarer trust & safety. Document the facts in the journal.",
      "Wait until you have proof before telling anyone.",
    ],
    correctIndex: 2,
  },
  {
    key: "safeguarding_children",
    title: "Safeguarding Children",
    summary:
      "Recognising abuse in children, your duty to act, and how reporting differs in the UK and US.",
    bodyMarkdown: `If you care for children on SpecialCarer, safeguarding is your single most important responsibility. A child is anyone under 18. Children depend on adults to keep them safe — your job is to be alert, attentive, and willing to act on a concern, even when the evidence is partial.

The four broad categories of child abuse are: **physical**, **emotional**, **sexual**, and **neglect**. Look for indicators that don't add up: injuries the family struggles to explain, sudden behaviour changes, age-inappropriate sexual knowledge, persistent hunger or poor hygiene, fear of going home. A child may not use the word "abuse" — they may say "I don't want to go upstairs", or simply withdraw.

If a child discloses something to you: **listen, don't lead**. Don't promise to keep it secret. Use their words in your notes. Don't ask leading questions ("Did your dad hit you?") — instead, open ones ("What happened?"). After they finish, write down exactly what they said as soon as practical.

In the **UK**, you have a professional duty to share concerns with the local authority's Children's Services / MASH (Multi-Agency Safeguarding Hub) and SpecialCarer trust and safety. Refer urgently if a child is at immediate risk; otherwise within 24 hours. NSPCC helpline: 0808 800 5000.

In the **US**, mandatory reporting laws vary by state, but childcare workers are mandated reporters in most states. Report to the state's Child Protective Services (CPS) hotline and to SpecialCarer. National Child Abuse Hotline: 1-800-422-4453.

Call **999** (UK) or **911** (US) if you believe a child is in immediate danger.`,
    question:
      "A 6-year-old in your care says \"I don't want to go home tonight, dad gets angry.\" What's the best response?",
    options: [
      "Promise it'll be okay and not tell anyone if she doesn't want you to.",
      "Calmly listen, ask open questions like \"What happens when dad gets angry?\", document her exact words, and refer to MASH (UK) or CPS (US) plus SpecialCarer trust & safety.",
      "Tell the dad about the conversation so he can address it.",
      "Wait to see if she says it again before doing anything.",
    ],
    correctIndex: 1,
  },
  {
    key: "platform_policies",
    title: "SpecialCarer Platform Policies",
    summary:
      "How bookings, payments, and disputes work — and the rules every carer must follow.",
    bodyMarkdown: `SpecialCarer connects vetted carers with families who need help. As a carer on the platform, here are the policies that protect both sides.

**Bookings**: a booking is confirmed when the family pays. Funds are held in escrow by Stripe and released to you 24 hours after the shift completes. You're paid for the time you've actually worked — accept and arrive on time, complete the shift, and check out at the end.

**Cancellations**: as much notice as possible. Cancelling within 12 hours of a shift impacts your reliability score and may pause your account. If a family cancels late, you're partially compensated according to the cancellation table.

**Off-platform contact**: it's tempting to take a regular client off-platform to avoid the platform fee. **Don't.** Doing so removes their insurance, dispute protection, and SOS coverage — and is grounds for permanent removal. The platform fee funds the vetting, payments, and trust-and-safety infrastructure that keeps you and your clients safe.

**Tips and gifts**: tips paid through the platform are 0% fee — every penny reaches you. Cash tips are allowed; small gifts under £30/$30 are allowed. Anything larger must be declined and logged.

**Reviews**: families can leave a public review and private feedback after a shift. You can reply to reviews factually and politely. Don't pressure clients for reviews.

**Account standing**: repeated late cancellations, low ratings, safeguarding concerns, off-platform attempts, or failure to keep your DBS / Checkr current can all lead to suspension or permanent removal. Always tell trust and safety first if something goes wrong — we'd rather hear from you early.`,
    question:
      "A long-term client offers to pay you directly off the app to avoid the platform fee. What's the right response?",
    options: [
      "Accept — you keep more, and they pay less.",
      "Politely decline. Explain the platform handles payments, insurance, and disputes; off-platform work removes those protections and is grounds for removal.",
      "Accept once but tell them not to do it again.",
      "Ask SpecialCarer for permission to do it just this time.",
    ],
    correctIndex: 1,
  },
  {
    key: "code_of_conduct",
    title: "Code of Conduct",
    summary:
      "The standard of behaviour expected on every shift — punctuality, dignity, professionalism.",
    bodyMarkdown: `Every shift you work on SpecialCarer is a shift in someone's home, on a day where they probably need you because something is hard. The code of conduct is short but absolute.

**Treat every client with dignity and respect.** That includes the way you speak to them, the language you use about them in notes, and how you handle their personal belongings. Address them by the name they prefer. Never make jokes at their expense.

**Be punctual.** Arrive 5 minutes early. If you're going to be late, message immediately and explain. The tracker will record your actual arrival time — being on time is a measurable platform metric.

**Be honest about your skills.** Only do what you're trained to do. If a client asks you to administer a medication you're not authorised to give, explain politely and suggest they call their GP / NP / family. Do not take on a clinical task you're not certified for.

**Maintain professional boundaries.** Don't share your personal phone number, accept friend requests on social media, or develop a romantic relationship with a client or their family member. If you feel a relationship is becoming inappropriate, tell trust and safety.

**Dress and appearance.** Clean, neutral clothes; closed shoes; hair tied back where appropriate. Cover tattoos that may be culturally sensitive. No strong fragrance — many older clients are sensitive.

**No alcohol, drugs, or smoking on shift.** Including vaping in a client's home. If you take prescribed medication that affects driving or alertness, tell trust and safety.

**Confidentiality.** Don't talk about a client's situation with anyone outside the booking — not friends, not other clients, not on social media. See the GDPR & Confidentiality module for the legal side of this.

Breaches of the code are reviewed individually. Honesty about a slip-up is always treated more leniently than a cover-up.`,
    question:
      "Halfway through a shift you realise you're 30 minutes late and you didn't message. What do you do?",
    options: [
      "Don't mention it — hopefully the family didn't notice.",
      "Message the family immediately, apologise, explain briefly, and adjust your end-of-shift notes to reflect the actual arrival time.",
      "Stay an extra hour at the end and don't say anything.",
      "Ask the family to mark it as on-time so it doesn't affect your rating.",
    ],
    correctIndex: 1,
  },
  {
    key: "lone_working",
    title: "Lone Working & Personal Safety",
    summary:
      "How to keep yourself safe when you're working alone in someone else's home.",
    bodyMarkdown: `Most SpecialCarer shifts are lone-worker shifts: it's just you and the client, often in the client's home. The platform gives you tools — use them.

**Before the shift.** Read the booking notes. Add any access info to the booking, not your personal phone. Tell someone you trust which booking you're going to and when you expect to be back. The "Share trip" button on the tracker page sends a one-click link to a friend or family member.

**On arrival.** Take the arrival selfie when prompted — it stamps your check-in time and gives the family confidence you've arrived safely. If something feels off when you arrive (someone unexpected at the door, signs of intoxication, aggression), trust your instincts. You are entitled to leave.

**During the shift.** Keep your phone charged and accessible. The tracker page is always available — your live location is shared with the family while you're on it. The SOS button on the tracker page is the fastest way to reach trust and safety; it also alerts the family. **In a life-threatening emergency, call 999 (UK) or 911 (US) first**, then SOS.

**Pets and other people.** Ask the family in advance about pets, smokers, other visitors. If a stranger arrives during the shift and the client doesn't recognise them, do not let them in.

**Driving and travel.** Don't take unfamiliar shortcuts at night. Park where you can leave easily. If a client is in your car, follow their household's rules — never carry a child or vulnerable adult without explicit booking permission and proper restraints.

**End of shift.** Check out promptly. If you stay longer for any reason, message the family and update the booking. Don't accept cash payments outside the platform.

**Aftercare.** If anything difficult happened during a shift, talk to trust and safety. We can offer follow-up, dispute support, and signposting to professional help. You don't have to "tough it out".`,
    question:
      "A client's adult relative arrives at the door demanding to come in, but the client looks frightened and shakes their head. What do you do?",
    options: [
      "Let them in — it's their family.",
      "Don't open the door. Reassure the client, document what's happening, and use the SOS button if you feel unsafe. Call 999 / 911 if you believe anyone is in immediate danger.",
      "Step outside to talk to the relative privately.",
      "Hand the relative your phone so they can speak to the client directly.",
    ],
    correctIndex: 1,
  },
  {
    key: "gdpr_confidentiality",
    title: "GDPR & Confidentiality",
    summary:
      "Handling client data — what you can share, what you can't, and how to use the journal safely.",
    bodyMarkdown: `Care work is built on trust. Protecting client information is part of the job, and in many places it's also the law.

**The legal frame.** In the UK, the Data Protection Act 2018 and UK GDPR set the rules for handling personal data. In the US, HIPAA may apply to clients receiving healthcare — and state laws (e.g. California's CCPA) cover personal information more broadly. SpecialCarer is the data controller for booking-related data; you are a data processor acting on its instructions.

**What's confidential.** Everything: the client's identity, their address, their health condition, who their family is, what's said in their home. That includes pictures, videos, voice recordings, and screenshots — they belong to the client, not to you. Do not post them on social media. Do not share them in WhatsApp groups. Do not show them to friends.

**Using the in-app journal.** The journal is the right place to record clinical/care observations. Stick to facts: "9.30 — refused breakfast, said they felt nauseous." Avoid opinions ("the family is difficult") in entries that family members can read. Use private notes for your own reflections.

**Photos in the journal.** Only with the seeker's consent (toggled on the tracker page). Never include other people in the background. Never include the front of the house, the street name, or a vehicle plate.

**Clinical sharing.** If a GP / NP / nurse needs information, ask the family to share it via formal channels rather than forwarding screenshots from your phone. If trust and safety asks for a copy of an entry, that's appropriate — we have a controller agreement that makes this lawful.

**Right to erasure.** Clients can ask for their data to be deleted. Forward those requests to hello@specialcarer.com — we handle them.

**A breach.** If you lose a phone with the SpecialCarer app on it, or you accidentally email information to the wrong person, tell trust and safety **within 24 hours**. UK GDPR requires us to notify the ICO within 72 hours of certain breaches; we can only do that if you tell us first.`,
    question:
      "Your client makes a witty comment during a shift. You'd love to share it on Instagram with their first name. Is that okay?",
    options: [
      "Yes — first name only is fine.",
      "Yes if you don't tag the location.",
      "No. Anything you observe in a client's home is confidential. Don't post it to social media — even with first names removed — without explicit, documented written consent from the client.",
      "Yes if it's a positive story.",
    ],
    correctIndex: 2,
  },
];

export const COURSE_MODULES_BY_KEY: Record<string, CourseModule> =
  Object.fromEntries(COURSE_MODULES.map((m) => [m.key, m]));
