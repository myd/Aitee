/**
 * Terms rejected before any model call.
 *
 * This is a cheap first gate, not the real filter — the intake and print
 * reviewers catch everything this misses, which is most of it. Its two jobs
 * are to stop the blatant cases without spending tokens, and to make sure an
 * API outage fails closed rather than open.
 *
 * It lives in source rather than in a data file on purpose. A file read at
 * runtime is not traced by the bundler, so on a serverless deploy the list can
 * silently go missing and the gate quietly stops gating — the precise failure
 * this module exists to prevent. Shipping it as a module means it is always
 * there.
 *
 * Trust & safety can still update the list without a code deploy: point
 * BLOCKED_TERMS_PATH at a file and its contents are added to (never replace)
 * what is here. One term per line, # for comments.
 *
 * Matching happens on a normalised form of both the term and the customer's
 * text — case, accents, punctuation, spacing, repeated letters and common
 * leetspeak substitutions are folded away first (see normalise()) — so
 * "s l u r", "5lur" and "sluuur" all match a single entry of "slur". Entries
 * are substring matches on that normalised form, so keep them specific enough
 * not to sit inside an innocent word.
 *
 * Slurs are deliberately NOT checked in here. They need regular updating and
 * they need to be editable by trust & safety without a code review, so source
 * them from a maintained multilingual list and load it via BLOCKED_TERMS_PATH.
 * What follows is the non-slur portion: coded extremist phrases that are
 * unambiguous in any context.
 */
export const DEFAULT_BLOCKED_TERMS: readonly string[] = [
  "bloodandsoil",
  "blutundboden",
  "sieg heil",
  "heil hitler",
  "white power",
  "rahowa",
  "day of the rope",
  "you will not replace us",
  "jews will not replace us",
  "great replacement",
];
