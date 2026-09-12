import { test } from "node:test";
import assert from "node:assert/strict";
import { positivePrompt, negativePrompt } from "../lib/prompts/render-brief";
import { brief } from "./fixtures";

const spec = brief().spec;

test("every render is told not to produce a garment mockup", () => {
  const prompt = positivePrompt(spec, { has_text: false, exact_string: "" });
  assert.match(prompt, /Do NOT draw a t-shirt/);
  assert.match(negativePrompt(spec, { has_text: false, exact_string: "" }), /t-shirt mockup/);
});

test("a wordless design bans lettering in both the prompt and the negative", () => {
  const lettering = { has_text: false, exact_string: "" };
  assert.match(positivePrompt(spec, lettering), /LETTERING: none/);
  const negative = negativePrompt(spec, lettering);
  for (const term of ["text", "letters", "gibberish text"]) {
    assert.ok(negative.includes(term), `expected negative prompt to include "${term}"`);
  }
});

test("an approved string is passed through verbatim and lettering is not banned", () => {
  const lettering = { has_text: true, exact_string: "SLOW CLUB" };
  const prompt = positivePrompt(spec, lettering);
  assert.match(prompt, /"SLOW CLUB"/);
  assert.ok(!negativePrompt(spec, lettering).split(", ").includes("letters"));
});

test("the palette is stated as a hard ink count", () => {
  const prompt = positivePrompt(spec, { has_text: false, exact_string: "" });
  assert.match(prompt, /exactly 1 flat ink, no more/);
  assert.match(prompt, /sepia \(#4A3728, line\)/);
});

test("the art director's omit list reaches both prompts", () => {
  const lettering = { has_text: false, exact_string: "" };
  assert.match(positivePrompt(spec, lettering), /MUST NOT APPEAR: collar; name tag/);
  assert.ok(negativePrompt(spec, lettering).includes("name tag"));
});

test("counter-instructions from the failure pass are folded in", () => {
  const prompt = positivePrompt(spec, { has_text: false, exact_string: "" }, ["Short legs, long body."]);
  assert.match(prompt, /WATCH FOR: Short legs, long body\./);
});
