import type { BriefResult } from "./types";

/**
 * Verifies that the art director's aesthetic actually came from the customer.
 *
 * The prompt requires every aesthetic choice to be justified by verbatim quotes
 * from the request. This checks the quotes are real. That matters for two
 * reasons, and the second is the important one:
 *
 * 1. It catches a model that reached for a default and wrote a plausible
 *    rationalisation afterwards — the boring shirt, wearing a justification.
 *
 * 2. It is what makes the neutrality rule enforceable rather than aspirational.
 *    A shirt is for everyone: no palette, motif, print size or placement may be
 *    chosen from an assumption about the wearer's race, gender, age or body. We
 *    cannot inspect a model's reasons, but we can demand it show its working —
 *    and a stereotype has nothing to quote. An ungrounded aesthetic is one we
 *    cannot certify came from the customer's words, so it does not print unseen.
 */

export interface GroundingCheck {
  grounded: boolean;
  /** Quotes the model attributed to the customer that do not appear in the request. */
  unquoted: string[];
  reason?: string;
}

/**
 * Quotes are compared loosely on whitespace, case and quote characters — a
 * model that turns a straight apostrophe curly has still quoted faithfully —
 * but not on wording. Paraphrase is not evidence.
 */
function canonical(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function checkAestheticGrounding(brief: BriefResult, request: string): GroundingCheck {
  const aesthetic = brief.aesthetic;
  if (!aesthetic) {
    return { grounded: false, unquoted: [], reason: "the brief carries no aesthetic derivation at all" };
  }

  // A bare request ("a fox") genuinely carries no signal. Saying so is the
  // honest answer, and is explicitly allowed — but it has to be paid for with a
  // defence of the choice made instead, and it must not come with invented
  // evidence attached.
  if (aesthetic.signal_strength === "absent") {
    if (aesthetic.chosen_without_signal_because.trim().length === 0) {
      return {
        grounded: false,
        unquoted: [],
        reason: "claimed the request carried no aesthetic signal but did not defend the choice made instead",
      };
    }
    if ((aesthetic.evidence ?? []).length > 0) {
      return {
        grounded: false,
        unquoted: aesthetic.evidence.map((e) => e.quote),
        reason: "claimed the request carried no aesthetic signal yet cited evidence from it",
      };
    }
    return { grounded: true, unquoted: [] };
  }

  const evidence = aesthetic.evidence ?? [];
  if (evidence.length === 0) {
    return {
      grounded: false,
      unquoted: [],
      reason: `claimed an ${aesthetic.signal_strength} aesthetic signal but quoted nothing`,
    };
  }

  const haystack = canonical(request);
  const unquoted = evidence
    .map((e) => e.quote)
    .filter((quote) => {
      const needle = canonical(quote);
      return needle.length === 0 || !haystack.includes(needle);
    });

  if (unquoted.length > 0) {
    return {
      grounded: false,
      unquoted,
      reason: "cited words the customer never wrote, so the aesthetic cannot be traced to them",
    };
  }

  return { grounded: true, unquoted: [] };
}
