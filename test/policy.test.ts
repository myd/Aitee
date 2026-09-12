import { test } from "node:test";
import assert from "node:assert/strict";
import { prescreen, normalise } from "../lib/policy/blocklist";

test("normalise folds the usual evasions together", () => {
  assert.equal(normalise("s l u r"), normalise("slur"));
  assert.equal(normalise("5LUR"), normalise("slur"));
  assert.equal(normalise("sluuuur"), normalise("slur"));
  assert.equal(normalise("s.l-u_r"), normalise("slur"));
});

test("blocks coded extremist numerics", () => {
  for (const text of ["a design with 1488 on it", "just 14 88 please", "6MWE tee"]) {
    const result = prescreen(text);
    assert.equal(result.blocked, true, `expected ${text} to be blocked`);
    assert.ok(result.flags.includes("hate_or_extremism"));
  }
});

test("blocks blocked-list phrases through spacing and leetspeak evasion", () => {
  const result = prescreen("put w h i t e   p0wer across the chest");
  assert.equal(result.blocked, true);
  assert.ok(result.flags.includes("slur_or_dehumanisation"));
});

test("blocks scannable codes and personal data", () => {
  assert.equal(prescreen("a QR code linking to my site").blocked, true);
  assert.equal(prescreen("put a barcode on the back").blocked, true);
  assert.equal(prescreen("my number 555-123-4567 on the sleeve").blocked, true);
  assert.equal(prescreen("card 4111 1111 1111 1111").blocked, true);
});

test("blocks the triple-parenthesis echo", () => {
  const result = prescreen("a shirt that says (((them)))");
  assert.equal(result.blocked, true);
  assert.ok(result.flags.includes("targets_real_person"));
});

test("lets ordinary requests through untouched", () => {
  const ordinary = [
    "my corgi wearing a tiny crown",
    "a mountain range at sunrise, minimal",
    "something for my hiking group, we call ourselves the Slow Club",
    "a cassette tape unspooling into a river",
    "bar chart of my sourdough failures",
  ];
  for (const text of ordinary) {
    const result = prescreen(text);
    assert.equal(result.blocked, false, `expected "${text}" to pass, got flags ${result.flags.join()}`);
  }
});
