/**
 * The single source of truth for what may end up on a garment.
 *
 * The same document is handed to the intake reviewer (which reads the
 * customer's words, before we spend anything) and to the print reviewer (which
 * looks at the finished artwork, before we spend anything on ink). Sharing one
 * text is deliberate: a rule can never be enforced at one end and forgotten at
 * the other, and when the policy changes both ends change together.
 *
 * Bump VERSION on every edit. It is stored on each order so that a garment
 * which shipped can always be traced back to the rules it was judged against.
 */

export const POLICY_VERSION = "2026-09-12";

/**
 * Absolute refusals. Nothing in the customer's request, and nothing in the
 * finished artwork, may fall into these. There is no "but the customer really
 * wanted it" exception.
 */
export const NEVER_PRINT = `NEVER PRINT

1. HATE AND EXTREMISM. Symbols, slogans, flags, uniforms or insignia of hate
   movements and violent extremist groups. This includes coded forms: numeric
   codes (14, 88, 1488, 6MWE, 109/110), the sonnenrad and black sun, SS runes,
   the Confederate battle flag, Klan imagery, "Kek" and Pepe-derived far-right
   iconography, the OK hand used as a hate sign, and triple-parenthesis echoes
   around a name. Treat a symbol as in-scope even when it is stylised, partial,
   mirrored, or folded into decoration.

2. SLURS AND DEHUMANISATION. Slurs or dehumanising language aimed at a race,
   ethnicity, nationality, religion, caste, gender, sexual orientation,
   disability or immigration status, in any language, including reclaimed
   slurs (we cannot know who will wear or see the garment) and deliberate
   misspellings.

3. TARGETING A REAL PERSON. Content that names, depicts or is clearly aimed at
   a real, identifiable private individual in order to accuse, shame, threaten,
   sexualise or harass them.

4. SEXUAL CONTENT. Nudity, sexual acts, or sexualised depiction of any body.
   Anything sexualising a minor is an absolute refusal and must be flagged, not
   merely declined.

5. MINORS. Any depiction of a real, identifiable child, and any depiction of a
   minor in a violent, sexual or degrading context.

6. VIOLENCE AND GORE. Realistic gore, mutilation, corpses, imagery of a real
   atrocity or mass-casualty event, credible threats, and weapons pointed at
   the viewer.

7. SELF-HARM AND SUBSTANCE HARM. Promotion, instruction or glamorisation of
   suicide, self-injury, disordered eating, or drug use. Recovery and memorial
   themes are allowed and welcome; promotion is not.

8. ILLEGAL GOODS AND SERVICES. Instructions for, or advertisement of, weapons
   manufacture, drug sales, fraud, hacking, trafficking, or forged documents.

9. THIRD-PARTY INTELLECTUAL PROPERTY. Company logos and wordmarks, trademarked
   slogans, sports team marks, university marks, band logos and album art,
   currency, and recognisable characters owned by someone else (cartoon, film,
   game, comic, mascot). Naming a living artist and asking for "their style" is
   also out. Generic subjects are fine; it is the owned mark or character that
   is not.

10. REAL PEOPLE'S LIKENESS. Photoreal or clearly recognisable likenesses of
    celebrities, politicians, athletes or other public figures.

11. FALSE AUTHORITY. Police, military, government, medical or safety insignia,
    badges, certifications, or anything that would let the wearer pass as an
    official. Also ID cards, boarding passes, and barcodes that imply a real
    credential.

12. CLAIMS THAT COULD HURT SOMEONE. Medical, health, dietary, financial or
    legal claims stated as fact ("cures", "guaranteed returns").

13. PRIVATE DATA AND SCANNABLE CODES. Phone numbers, home addresses, email
    addresses, licence plates, account or card numbers. Also NO QR CODES,
    barcodes, or any other scannable code, ever — a generated code points
    somewhere nobody has checked, and we would be printing an unvetted link on
    a garment.

14. DESECRATION. Sacred symbols, scripture or religious figures used mockingly
    or defiled. Respectful religious imagery is fine.`;

/**
 * Not refusals — these ship only after a human has looked at the file. The
 * customer never sees the design before it arrives, so anything whose failure
 * mode is "we printed something they'd be ashamed to wear" gets a second pair
 * of (human) eyes rather than a coin flip.
 */
export const ALWAYS_ESCALATE = `SEND TO HUMAN REVIEW (do not refuse, do not auto-approve)

A. ANY LETTERING AT ALL. Text is the single most common way a print goes wrong:
   a misspelling, a word broken across a line, or a slur assembled out of
   decorative letterforms. Every design containing a visible character goes to
   a human, even when the text is exactly what the customer asked for.

B. A REAL PERSON THE CUSTOMER KNOWS. Portraits from a description ("my
   grandmother", "my partner Ana") are allowed, but a human checks them.

C. PARTISAN POLITICS. Candidates, parties, elections, referendums, and active
   political movements. We print these; we do not print them unseen.

D. CONTESTED CONFLICTS AND FLAGS. National flags, borders, territorial claims,
   and imagery tied to an ongoing conflict.

E. RECLAIMED OR IN-GROUP LANGUAGE. Wording that is affirming from inside a
   community and a slur from outside it.

F. DARK HUMOUR AND EDGE. Jokes about death, illness, addiction, religion or
   tragedy. Often perfectly fine and exactly what was asked for — but a human
   decides, not us.

G. CHILDREN'S SIZES. Anything ordered in a child's size, with any adult theme
   whatsoever.

H. NEAR-MISS IP. A subject that is generic in principle but is drifting toward
   a specific owned character or mark.`;

export const POLICY_DOCUMENT = `${NEVER_PRINT}\n\n${ALWAYS_ESCALATE}`;

/**
 * Machine-readable labels. Reviewers pick from this list rather than inventing
 * their own, so flags can be counted, alerted on, and used to spot a customer
 * probing for a gap.
 */
export const FLAGS = [
  // drawn from NEVER PRINT
  "hate_or_extremism",
  "slur_or_dehumanisation",
  "targets_real_person",
  "sexual_content",
  "minors",
  "violence_or_gore",
  "self_harm_or_substance",
  "illegal_goods",
  "third_party_ip",
  "real_person_likeness",
  "false_authority",
  "unsafe_claim",
  "private_data_or_scannable_code",
  "desecration",
  // drawn from SEND TO HUMAN REVIEW
  "contains_text",
  "known_person",
  "partisan_politics",
  "contested_conflict",
  "reclaimed_language",
  "dark_humour",
  "childrens_size",
  "near_miss_ip",
] as const;

export type Flag = (typeof FLAGS)[number];

/**
 * One of these on a rendered design is a full stop, not a setback. The pipeline
 * does not re-roll the dice on a safety failure: a second attempt from the same
 * brief is likely to reproduce it, and "it passed on the fourth try" is not a
 * record any studio wants to have to explain.
 */
export const HARD_FLAGS: readonly Flag[] = [
  "hate_or_extremism",
  "slur_or_dehumanisation",
  "targets_real_person",
  "sexual_content",
  "minors",
  "violence_or_gore",
  "self_harm_or_substance",
  "illegal_goods",
  "third_party_ip",
  "real_person_likeness",
  "false_authority",
  "unsafe_claim",
  "private_data_or_scannable_code",
  "desecration",
];

/** These never block an order. They route it to a person. */
export const ESCALATION_FLAGS: readonly Flag[] = FLAGS.filter(
  (f) => !HARD_FLAGS.includes(f),
);

export const VERDICTS = [
  "approve",
  "approve_with_constraints",
  "hold_for_human",
  "decline",
] as const;

export const RISK_TIERS = ["green", "amber", "red"] as const;
