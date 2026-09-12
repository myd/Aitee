import { test } from "node:test";
import assert from "node:assert/strict";
import { positivePrompt, negativePrompt } from "../lib/prompts/render-brief";
import { brief, lettering, setText } from "./fixtures";

const spec = brief().spec;

test("every render is told not to produce a garment mockup", () => {
  const prompt = positivePrompt(spec, lettering());
  assert.match(prompt, /Do NOT draw a t-shirt/);
  assert.match(negativePrompt(spec, lettering()), /t-shirt mockup/);
});

test("a wordless design bans lettering in both the prompt and the negative", () => {
  const wordless = lettering();
  assert.match(positivePrompt(spec, wordless), /LETTERING: none/);
  const negative = negativePrompt(spec, wordless);
  for (const term of ["text", "letters", "gibberish text"]) {
    assert.ok(negative.includes(term), `expected negative prompt to include "${term}"`);
  }
});

test("an approved string is passed through verbatim and lettering is not banned", () => {
  const approved = setText("SLOW CLUB");
  const prompt = positivePrompt(spec, approved);
  assert.match(prompt, /"SLOW CLUB"/);
  assert.match(prompt, /Set it in: narrow grotesque/);
  assert.ok(!negativePrompt(spec, approved).split(", ").includes("letters"));
});

test("the palette is stated as a hard ink count", () => {
  const prompt = positivePrompt(spec, lettering());
  assert.match(prompt, /exactly 1 flat ink, no more/);
  assert.match(prompt, /sepia \(#4A3728, line\)/);
});

test("the art director's omit list reaches both prompts", () => {
  const wordless = lettering();
  assert.match(positivePrompt(spec, wordless), /MUST NOT APPEAR: collar; name tag/);
  assert.ok(negativePrompt(spec, wordless).includes("name tag"));
});

test("counter-instructions from the failure pass are folded in", () => {
  const prompt = positivePrompt(spec, lettering(), ["Short legs, long body."]);
  assert.match(prompt, /WATCH FOR: Short legs, long body\./);
});
