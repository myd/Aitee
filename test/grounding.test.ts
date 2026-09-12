import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAestheticGrounding } from "../lib/pipeline/grounding";
import { brief } from "./fixtures";
import type { BriefResult } from "../lib/pipeline/types";

const REQUEST = "my corgi, who has never once come when called — make it interesting";

function withAesthetic(aesthetic: Partial<BriefResult["aesthetic"]>): BriefResult {
  return brief({ aesthetic: { ...brief().aesthetic, ...aesthetic } });
}

test("an aesthetic quoting the customer's actual words is grounded", () => {
  const result = checkAestheticGrounding(
    withAesthetic({
      signal_strength: "implied",
      evidence: [{ quote: "has never once come when called", reads_as: "wry, self-deprecating" }],
    }),
    REQUEST,
  );
  assert.equal(result.grounded, true);
});

test("quotes are matched through curly quotes, dashes and whitespace noise", () => {
  const result = checkAestheticGrounding(
    withAesthetic({
      signal_strength: "implied",
      evidence: [{ quote: "Never   Once\nCome When Called", reads_as: "deadpan" }],
    }),
    REQUEST,
  );
  assert.equal(result.grounded, true, "faithful quoting should survive formatting differences");
});

test("a paraphrase is not evidence", () => {
  const result = checkAestheticGrounding(
    withAesthetic({
      signal_strength: "implied",
      evidence: [{ quote: "a disobedient dog", reads_as: "wry" }],
    }),
    REQUEST,
  );
  assert.equal(result.grounded, false);
  assert.deepEqual(result.unquoted, ["a disobedient dog"]);
});

test("a stereotype has nothing to quote, so it fails the check", () => {
  // The failure mode this exists to catch: the model reaches for a demographic
  // default and writes the justification afterwards.
  const result = checkAestheticGrounding(
    withAesthetic({
      register: "feminine",
      world: "soft pastels and florals",
      signal_strength: "implied",
      evidence: [{ quote: "for my wife", reads_as: "suggests a softer palette" }],
    }),
    "a design of a mountain range for my partner's birthday",
  );
  assert.equal(result.grounded, false);
  assert.match(result.reason ?? "", /never wrote/);
});

test("claiming a signal while quoting nothing is not grounded", () => {
  const result = checkAestheticGrounding(
    withAesthetic({ signal_strength: "implied", evidence: [] }),
    REQUEST,
  );
  assert.equal(result.grounded, false);
  assert.match(result.reason ?? "", /quoted nothing/);
});

test("a bare request may honestly report no signal, if it defends the choice", () => {
  const result = checkAestheticGrounding(
    withAesthetic({
      signal_strength: "absent",
      evidence: [],
      chosen_without_signal_because: "Nothing in 'a fox' points anywhere, so: cyanotype, for the silhouette.",
    }),
    "a fox",
  );
  assert.equal(result.grounded, true);
});

test("reporting no signal without defending the choice is not grounded", () => {
  const result = checkAestheticGrounding(
    withAesthetic({ signal_strength: "absent", evidence: [], chosen_without_signal_because: "  " }),
    "a fox",
  );
  assert.equal(result.grounded, false);
});

test("reporting no signal while citing evidence anyway is incoherent and fails", () => {
  const result = checkAestheticGrounding(
    withAesthetic({
      signal_strength: "absent",
      evidence: [{ quote: "a fox", reads_as: "foxiness" }],
      chosen_without_signal_because: "chose cyanotype",
    }),
    "a fox",
  );
  assert.equal(result.grounded, false);
});
