/**
 * Skills assessment question bank — 10 MCQ per vertical.
 * Used by /api/carer/skills-quiz (server) and the dashboard quiz UI.
 *
 * NOTE: this is a baseline competency screen, not a clinical
 * qualification. Carers must defer to professional training and local
 * protocols for actual care delivery.
 */

import type { QuizQuestion, Vertical } from "./types";

const elderly_care: QuizQuestion[] = [
  {
    id: "ec_1",
    prompt:
      "An elderly client with mild dementia becomes suddenly agitated and confused over the course of a day. Their carer notices they're going to the toilet more often. What's the most likely first thing to consider?",
    options: [
      "Worsening dementia — note it for the family.",
      "A urinary tract infection (UTI), which often presents in older adults as new confusion or agitation. Flag to the family for a GP / NP review.",
      "Boredom — try a new activity.",
      "Nothing unusual — older people often have changeable moods.",
    ],
    correctIndex: 1,
  },
  {
    id: "ec_2",
    prompt:
      "A client wants to stand up from their armchair but is unsteady. The safest approach is:",
    options: [
      "Pull them up by the wrists.",
      "Bend forward and lift under their arms.",
      "Encourage them to shuffle to the edge of the seat, place feet flat, lean forward, and push up using the chair arms; you stand close in front to guide and support, not lift.",
      "Tell them to wait for the family to do it.",
    ],
    correctIndex: 2,
  },
  {
    id: "ec_3",
    prompt:
      "Best practice for communicating with someone living with dementia includes:",
    options: [
      "Talking quickly to keep their attention.",
      "Speaking calmly, using short sentences, making eye contact, allowing extra time to respond, and avoiding correction of confused statements when correction won't help.",
      "Quizzing them on what day it is to keep them sharp.",
      "Speaking on their behalf to visitors.",
    ],
    correctIndex: 1,
  },
  {
    id: "ec_4",
    prompt: "Which is the most effective everyday falls-prevention measure?",
    options: [
      "Keeping the room dark to encourage rest.",
      "Removing trip hazards (rugs, cables), making sure walking aids are within reach, ensuring good lighting and supportive footwear.",
      "Telling the client not to walk without you.",
      "Restraining the client in their chair when alone.",
    ],
    correctIndex: 1,
  },
  {
    id: "ec_5",
    prompt:
      "A client asks you to give them their warfarin tablet. You are not certified to administer medication. What should you do?",
    options: [
      "Give it to them — it's just a reminder.",
      "Refuse and walk out.",
      "Politely explain you can prompt and remind, but cannot administer. Offer to call the family or district nurse, and document what happened in the journal.",
      "Halve the dose to be safe.",
    ],
    correctIndex: 2,
  },
  {
    id: "ec_6",
    prompt: "Early signs of dehydration in an elderly person commonly include:",
    options: [
      "Increased appetite and chatty mood.",
      "Dry mouth, dark concentrated urine, mild confusion or dizziness, sunken eyes, and reduced urine output.",
      "Cool moist skin and lots of saliva.",
      "Weight gain over a day.",
    ],
    correctIndex: 1,
  },
  {
    id: "ec_7",
    prompt:
      "A client repeatedly refuses to wash. The right approach is to:",
    options: [
      "Insist firmly; hygiene is non-negotiable.",
      "Skip it and move on; their choice.",
      "Explore why — pain, fear, dignity, depression — offer alternatives (warm flannel, a different time of day), document the refusal, and tell the family/care plan owner if it persists.",
      "Wash them while they're asleep.",
    ],
    correctIndex: 2,
  },
  {
    id: "ec_8",
    prompt: "End-of-life care prioritises:",
    options: [
      "Aggressive medical intervention until the last possible moment.",
      "Comfort, dignity, the person's expressed wishes, family presence, and following the documented care plan / advance directive.",
      "Keeping the room silent and unlit at all times.",
      "Avoiding all conversation about death.",
    ],
    correctIndex: 1,
  },
  {
    id: "ec_9",
    prompt:
      "You notice unexplained bruising on the upper arms of a frail older client and they flinch when you approach. The right next step is:",
    options: [
      "Ask the family directly if they hit the client.",
      "Gently document the marks (size, location, colour) in the journal, ask the client only open questions, ensure they're safe, and report to your local Adult Safeguarding hub (UK) or APS (US) and SpecialCarer trust & safety.",
      "Take a photo and post it to your private Instagram for advice.",
      "Wait and see if it happens again.",
    ],
    correctIndex: 1,
  },
  {
    id: "ec_10",
    prompt: "A practical way to reduce isolation for a housebound elder is:",
    options: [
      "Encourage them to spend more time alone to rest.",
      "Use shift time to share a cup of tea, a familiar music playlist, a video call with family, or a walk to the local shops if mobility allows.",
      "Leave the TV news on at high volume.",
      "Tell them being lonely is just part of getting old.",
    ],
    correctIndex: 1,
  },
];

const childcare: QuizQuestion[] = [
  {
    id: "cc_1",
    prompt:
      "A 2-year-old in your care is choking on a piece of food but can still cough forcefully. The right action is:",
    options: [
      "Give five back blows immediately.",
      "Encourage them to cough — coughing is moving air. Stay close, watch for any change to silence, weak cough, blue lips. If those appear, intervene with paediatric back blows / chest thrusts and call 999/911.",
      "Reach into their mouth with your fingers.",
      "Pick them up by the ankles.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_2",
    prompt:
      "Safe sleep guidance for a baby under 12 months is:",
    options: [
      "Tummy down with a soft pillow for comfort.",
      "On their back, in a clear cot — no pillows, duvets, bumpers, or soft toys; feet near the foot of the cot; room temperature 16–20°C.",
      "On their side, propped with rolled towels.",
      "Co-sleeping is always safest.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_3",
    prompt:
      "When supervising children at the playground, the most important rule is:",
    options: [
      "Sit on the bench and check your phone — they need independence.",
      "Stay actively engaged: positioned where you can see all the children you're responsible for, scanning continuously, ready to move quickly. Phone is for emergencies, not scrolling.",
      "Watch only the youngest; older ones are fine alone.",
      "Stand at the entrance and watch from there.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_4",
    prompt:
      "A 6-month-old has a temperature of 38.5°C. The right response is:",
    options: [
      "Wait until tomorrow to see if it goes up.",
      "Strip them naked and put them in cold water.",
      "Inform the family immediately. Babies under 3 months with a fever ≥38°C need urgent medical assessment; for older babies, follow the family's care plan and seek advice if they're miserable, not feeding, or have other red-flag symptoms (rash, breathing changes, persistent vomiting). Call 111 (UK) or paediatrician (US) when in doubt.",
      "Give them paracetamol from the family's cabinet without asking.",
    ],
    correctIndex: 2,
  },
  {
    id: "cc_5",
    prompt: "Best response to a tantrum in a 3-year-old is:",
    options: [
      "Match their volume to assert authority.",
      "Stay calm, get down to their level, name the feeling (\"You're really cross\"), keep them and others safe, and wait it out — once the storm passes, talk briefly about what happened.",
      "Send them to their room until they apologise.",
      "Promise a treat to make them stop.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_6",
    prompt:
      "Nutritional best practice when offering snacks to a 2-year-old:",
    options: [
      "Whole grapes are easy to grab and tasty.",
      "Cut food that could choke (grapes, cherry tomatoes, sausages, blueberries) into quarters lengthways. Avoid whole nuts. Sit the child down to eat, and never leave them eating unsupervised.",
      "Crisps and biscuits are fine in unlimited quantities.",
      "Hot drinks are fine if you blow on them first.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_7",
    prompt:
      "A child confides they're being hit at home. The right first response is:",
    options: [
      "Tell them you'll keep it secret so they trust you.",
      "Listen without leading questions, write down their exact words as soon as practical, ensure they're safe right now, and report to your local Children's Services / MASH (UK) or CPS (US) plus SpecialCarer trust & safety.",
      "Confront the parent at pickup.",
      "Wait until you have proof before doing anything.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_8",
    prompt:
      "The principle of \"reasonable adjustments\" in childcare means:",
    options: [
      "Treating every child identically regardless of needs.",
      "Recognising that children with disabilities, additional needs, or different cultural backgrounds may need adapted activities, communication, or routines so they can take part on an equal footing.",
      "Lowering safety standards for some children.",
      "Ignoring formal care plans if they slow you down.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_9",
    prompt: "An effective bedtime routine for a 4-year-old typically:",
    options: [
      "Includes screen time right up to lights out.",
      "Has consistent timing, low stimulation in the last 30 minutes, a calm sequence (bath, brush teeth, story), and low-volume voices. Children learn safety from predictability.",
      "Means leaving them alone in a dark room until they fall asleep.",
      "Should be different every night to keep it interesting.",
    ],
    correctIndex: 1,
  },
  {
    id: "cc_10",
    prompt:
      "You've been asked by a parent to give a 5-year-old an unprescribed antihistamine because they \"seem itchy\". You should:",
    options: [
      "Give it — antihistamines are over-the-counter.",
      "Decline to give any medication that isn't part of the documented care plan / written instructions for that child. Offer to call the parent so they can decide; document the request in the journal.",
      "Give half the dose to be safe.",
      "Ask the child if they want it.",
    ],
    correctIndex: 1,
  },
];

const special_needs: QuizQuestion[] = [
  {
    id: "sn_1",
    prompt:
      "A non-verbal autistic teenager you support uses a Picture Exchange Communication System (PECS) board. Their key worker has gone home. They tap the \"toilet\" card repeatedly. You should:",
    options: [
      "Wait for the key worker to return.",
      "Acknowledge the request immediately, support them to use the toilet according to their care plan, and praise the communication.",
      "Ask them to use words instead.",
      "Offer them a snack to distract.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_2",
    prompt:
      "Sensory overload in autistic individuals is best managed by:",
    options: [
      "Pushing them to \"power through\" the trigger.",
      "Reducing inputs (lower lights, quieter space, fewer demands), offering a known calming object or activity, and giving time without expecting eye contact or speech.",
      "Holding them still until they calm down.",
      "Making jokes to lighten the mood.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_3",
    prompt: "When supporting a person with Down's syndrome, you should:",
    options: [
      "Speak to their family member instead of them.",
      "Address the person directly, give them time to respond, use clear simple language without being patronising, and offer choices wherever possible.",
      "Use very loud, slow speech as a default.",
      "Avoid eye contact.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_4",
    prompt:
      "A client with cerebral palsy needs help with eating. Best practice includes:",
    options: [
      "Hold their head still so they don't move.",
      "Sit them upright in their seating system, follow their care plan / SLT advice on food consistency and pace, offer small mouthfuls, ensure swallow before next, and never feed them while reclined.",
      "Give them a thinner liquid to speed things up.",
      "Talk over them while feeding to entertain them.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_5",
    prompt:
      "A client with a learning disability says \"yes\" to most questions, including ones they appear not to understand. This may be:",
    options: [
      "Cooperation.",
      "Acquiescence bias — common when someone has been institutionalised or wants to please. Use yes/no alternatives, visual aids, and offer real choices to confirm consent.",
      "A sign they need more questions.",
      "Always reliable.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_6",
    prompt:
      "A young person with ADHD is becoming increasingly frustrated with a homework task. The best support is to:",
    options: [
      "Tell them to focus and finish before they can have a break.",
      "Break the task into shorter chunks with movement breaks, reduce competing stimuli, validate the difficulty (\"this bit is tricky\"), and use a visual timer.",
      "Take the task away as a punishment.",
      "Match their frustration level to push them.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_7",
    prompt:
      "A client has a personal emergency plan (PEEP) for fire evacuation. You should:",
    options: [
      "Treat it as advisory.",
      "Read it before the shift starts, know their evacuation route and equipment (e.g. evac chair), and follow it exactly in an emergency. Never delay a real evacuation to find a missing item.",
      "Wait for emergency services to arrive before moving them.",
      "Hide it so it doesn't worry the client.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_8",
    prompt:
      "Person-centred care means:",
    options: [
      "Treating every disabled person the same to be fair.",
      "Designing support around the individual's preferences, history, strengths and goals — not just their diagnosis. The plan is theirs, with consent, and changes as they change.",
      "Following the family's instructions even if the person disagrees.",
      "Doing what's quickest for the carer.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_9",
    prompt:
      "Use of restrictive physical intervention (e.g. holding) on a person with a learning disability is:",
    options: [
      "Acceptable when the carer feels frustrated.",
      "A last resort, used only when there is an immediate risk of serious harm, by a person trained in approved methods (e.g. PROACT-SCIPr-UK / PBS), proportionate, recorded, and reported under the safeguarding policy.",
      "Routine for difficult clients.",
      "Acceptable if the family asks for it.",
    ],
    correctIndex: 1,
  },
  {
    id: "sn_10",
    prompt:
      "A non-verbal client with cerebral palsy starts crying inconsolably during a shift. The first thing to check is:",
    options: [
      "Whether they want a different snack.",
      "Possible causes of distress in order: pain, hunger/thirst, toileting, temperature, position/posture, environment (noise, light), then emotional. Document and share with the family.",
      "Their TV programme.",
      "Whether they're misbehaving.",
    ],
    correctIndex: 1,
  },
];

const postnatal: QuizQuestion[] = [
  {
    id: "pn_1",
    prompt:
      "A new mother you're supporting bursts into tears when the baby cries and says she's a terrible mum. The right first response is:",
    options: [
      "Tell her she's overreacting.",
      "Listen non-judgementally, normalise the emotional swings of the early postnatal weeks (baby blues), gently look out for red-flag signs of postnatal depression or anxiety (persistent low mood, hopelessness, intrusive thoughts), and signpost to her GP / health visitor (UK) or OB / paediatrician (US) if concerns persist beyond 2 weeks.",
      "Take the baby to a different room and don't return until she's stopped.",
      "Tell her your friend had it worse.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_2",
    prompt: "Safe sleep advice for a newborn is:",
    options: [
      "Front-sleeping with a swaddle.",
      "Back to sleep, in a clear cot or moses basket — no pillows, duvets, bumpers, soft toys; feet near the foot of the cot; smoke-free environment; room temperature 16–20°C.",
      "On their side, with a rolled towel for support.",
      "Co-sleeping in the parents' bed is fine after a glass of wine.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_3",
    prompt:
      "A breastfeeding mum says the baby \"feeds for hours\" and her nipples are cracked. You should:",
    options: [
      "Tell her to switch to formula.",
      "Listen, encourage rest, suggest she contact her midwife / health visitor (UK) / lactation consultant (US) — the issue is most often latch, which a professional can assess. Don't give clinical advice yourself.",
      "Tell her every mum has it bad — she'll get used to it.",
      "Take the baby and give them water until she heals.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_4",
    prompt:
      "A 10-day-old baby has had no wet nappies for 8 hours, is sleepy, and is harder to wake for feeds. You should:",
    options: [
      "Wait until the next feed and reassess.",
      "Treat as urgent: tell the parents immediately and advise they contact their midwife / GP / 111 (UK) or paediatrician / 911 (US) — these can be early signs of dehydration or jaundice. Document.",
      "Try water from a teaspoon.",
      "Run a warm bath to wake them.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_5",
    prompt:
      "Bonding-supporting actions for new parents include:",
    options: [
      "Encouraging skin-to-skin contact, narrating what you're doing while you handle the baby, supporting parent-led routines, and pointing out the baby's cues so the parent can respond.",
      "Doing all the baby care yourself so the parent can sleep all day.",
      "Telling the parent how the baby \"prefers\" you.",
      "Photographing the baby for your social media.",
    ],
    correctIndex: 0,
  },
  {
    id: "pn_6",
    prompt:
      "A mum 14 days postpartum reports a sudden severe headache, blurred vision, and swelling in her hands and face. You should:",
    options: [
      "Suggest she lie down and try a paracetamol.",
      "Treat as a possible postnatal pre-eclampsia (medical emergency) — tell the family immediately, advise them to call 999 / 911 or her maternity unit's emergency line, and document.",
      "Recommend a fast walk to clear her head.",
      "Wait until tomorrow.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_7",
    prompt:
      "Sterilising bottles and feeding equipment is required:",
    options: [
      "Only if the bottle was dropped on the floor.",
      "Until the baby is 12 months old; equipment is washed in hot soapy water and rinsed, then sterilised by steam, cold-water tablets, or boiling per manufacturer guidance. Wash hands first.",
      "Once a week is enough.",
      "Only if the baby has been ill.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_8",
    prompt:
      "If a partner or family member appears controlling or aggressive towards the new mother, you should:",
    options: [
      "Stay out of it — family business.",
      "Note the facts in the journal, ensure mum and baby are safe right now, and report to local Adult Safeguarding hub (UK) or APS / domestic abuse hotline (US) and SpecialCarer trust & safety. Postnatal women are at increased risk of domestic abuse.",
      "Confront the relative directly.",
      "Tell mum she should leave him.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_9",
    prompt:
      "Best practice when responding to night-time newborn cries is:",
    options: [
      "Wait 20 minutes to teach them not to cry.",
      "Respond promptly: lift, hold, check (nappy, hunger, temperature, comfort). Newborns can't \"manipulate\" — they cry because they need a caregiver.",
      "Bring them downstairs to watch TV.",
      "Give them a bottle of cooled boiled water to settle them.",
    ],
    correctIndex: 1,
  },
  {
    id: "pn_10",
    prompt:
      "Hand hygiene around a newborn means:",
    options: [
      "Quick rinse if the baby seems alert.",
      "Wash hands with soap and warm water for 20 seconds before handling the baby, after nappy changes, before feeds, after blowing your nose. Alcohol gel is a backup, not a replacement, when hands are visibly soiled.",
      "Use perfumed hand cream right before contact.",
      "Hand-washing isn't necessary if you've used a wipe.",
    ],
    correctIndex: 1,
  },
];

const complex_care: QuizQuestion[] = [
  {
    id: "cx_1",
    prompt:
      "A client with a long-term tracheostomy starts coughing weakly, looks pale, and their oxygen saturation drops on the monitor. The first action is:",
    options: [
      "Encourage them to drink water.",
      "Treat as airway emergency: position upright, suction per care plan if trained and authorised, call for help (family / specialist nurse / 999 / 911), oxygen if prescribed, document. Do NOT remove the tracheostomy unless trained and authorised.",
      "Loosen the tracheostomy ties and pull the tube partway out.",
      "Give them an inhaler.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_2",
    prompt:
      "PEG (gastrostomy) feeding for a non-verbal adult: which is correct?",
    options: [
      "Lie them flat to feed.",
      "Position at 30–45° during the feed and for 30–60 minutes after; check the site daily for redness, leakage, or bleeding; flush per care plan; never administer crushed tablets unless authorised; report any pain or vomiting immediately.",
      "Push the feed in fast to save time.",
      "Use the PEG site to give intramuscular medication.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_3",
    prompt:
      "A client with epilepsy has a seizure with full body convulsions. The right action is:",
    options: [
      "Put a spoon in their mouth so they don't bite their tongue.",
      "Stay with them, time the seizure, protect their head with something soft, do NOT restrain or put anything in their mouth. After the convulsion, place them in the recovery position. Call 999 / 911 if the seizure lasts >5 minutes, repeats, the person is injured, or it's their first seizure.",
      "Pour cold water over them.",
      "Hold them down to stop the movement.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_4",
    prompt:
      "A wheelchair-using client says they feel a pressure sore is forming on their sacrum. You should:",
    options: [
      "Apply a hot compress.",
      "Inspect the area (with consent), follow the care plan for repositioning every 2 hours or per their bespoke schedule, ensure cushion and seating are correct, document size/colour/skin breaks, and escalate to district nurse or tissue viability nurse if the skin is broken or worsening.",
      "Tell them to stay seated longer to avoid disturbing it.",
      "Apply Vaseline and forget about it.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_5",
    prompt:
      "A client uses non-invasive ventilation (NIV / BiPAP) at night. Which is correct?",
    options: [
      "Switching it off if they look more comfortable.",
      "Set it up per the documented prescription, check mask fit and skin under the mask, ensure the humidifier is filled correctly, watch for desaturation or distress, and never adjust pressures yourself — only the prescribing team can.",
      "Removing the mask to give them a quick drink mid-night without informing anyone.",
      "Cleaning the tubing with bleach.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_6",
    prompt:
      "A diabetic client on insulin shows confusion, sweating, and trembling, and is still able to swallow. You should:",
    options: [
      "Give insulin immediately.",
      "Suspect hypoglycaemia: give 15g fast-acting carbohydrate (glucose tablets, 150ml fruit juice, sugary drink) per their hypo plan, recheck blood glucose in 15 minutes if you have a meter, follow with a longer-acting snack. Call 999 / 911 if they become unresponsive.",
      "Make them lie down and stop talking.",
      "Wait until their next mealtime.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_7",
    prompt: "Catheter care best practice includes:",
    options: [
      "Pulling on the catheter to make sure it's secure.",
      "Hand hygiene + gloves before and after, daily meatal cleansing per care plan, keeping the bag below bladder level, never letting the bag touch the floor, monitoring urine colour/volume, reporting blood, sediment, or no output for 4+ hours.",
      "Topping up the drainage bag with water.",
      "Disconnecting and reconnecting the bag for fun walks.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_8",
    prompt:
      "Anaphylaxis presents with rapidly developing tongue/throat swelling, breathing difficulty, and a widespread rash. The right action is:",
    options: [
      "Antihistamine and a calm chat.",
      "Call 999 / 911 immediately. If the client has an Epipen / Jext and a documented anaphylaxis plan that authorises you, administer adrenaline into the outer thigh per the plan and prepare a second pen. Lay the person down with legs raised; if breathing is hard, sit them up. Keep them warm. Note the time of the dose.",
      "Give them milk to drink.",
      "Drive them to the GP.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_9",
    prompt:
      "Spinal-cord-injured client at risk of autonomic dysreflexia presents with a sudden pounding headache, sweating above the level of injury, and high blood pressure. The first thing to check is:",
    options: [
      "Whether they want a coffee.",
      "Whether their bladder is full or catheter blocked, then bowel obstruction, then constrictive clothing or a pressure source. Sit them upright, follow their AD plan exactly, and seek urgent medical help — autonomic dysreflexia is a medical emergency.",
      "Give them paracetamol and put them to bed.",
      "Massage their neck.",
    ],
    correctIndex: 1,
  },
  {
    id: "cx_10",
    prompt:
      "Documentation in complex care should:",
    options: [
      "Be written at the end of the week from memory.",
      "Be objective, factual, contemporaneous (recorded as close to the event as possible), legible, and signed/timed; record interventions, observations, and any deviations from the care plan with the rationale.",
      "Include your personal opinions about the client's family.",
      "Be deleted if a mistake is made.",
    ],
    correctIndex: 1,
  },
];

export const SKILLS_QUESTIONS: Record<Vertical, QuizQuestion[]> = {
  elderly_care,
  childcare,
  special_needs,
  postnatal,
  complex_care,
};
