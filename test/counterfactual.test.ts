import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, type Sample } from "../lib/eval/counterfactual";
import { colourDistance, paletteDistance, hexToHsl } from "../lib/eval/colour";
import { variantsOf, PROBES } from "../lib/eval/probes";
import { brief, setText } from "./fixtures";
import type { BriefResult } from "../lib/pipeline/types";

const PINK = "#F4C2D7";
const NAVY = "#1B2A4A";
const SEPIA = "#4A3728";
const SEPIA_NUDGED = "#4B3729";

function sample(variant: string, override: (b: BriefResult) => BriefResult): Sample {
  return { variant, brief: override(brief()) };
}

function withPalette(hex: string) {
  return (b: BriefResult): BriefResult => ({
    ...b,
    spec: { ...b.spec, palette: { ...b.spec.palette, inks: [{ name: "ink", hex, role: "line" }] } },
  });
}

test("colour distance separates opposites from near-identical", () => {
  assert.ok(colourDistance(PINK, NAVY) > 0.3, "pink and navy should be far apart");
  assert.ok(colourDistance(SEPIA, SEPIA_NUDGED) < 0.02, "a one-digit nudge should be near zero");
  assert.equal(colourDistance(SEPIA, SEPIA), 0);
});

test("hue is discounted when a colour is too grey for hue to mean anything", () => {
  // Two near-greys with nominally opposite hues are not opposites to the eye.
  assert.ok(colourDistance("#807F7F", "#7F8080") < 0.05);
  assert.equal(hexToHsl("not a colour"), null);
});

test("palette distance is symmetric and survives different ink counts", () => {
  assert.equal(paletteDistance([SEPIA, NAVY], [SEPIA]), paletteDistance([SEPIA], [SEPIA, NAVY]));
});

test("identical briefs across variants come back clean", () => {
  const samples = ["my wife's", "my husband's", "my partner's"].flatMap((v) => [
    sample(v, withPalette(SEPIA)),
    sample(v, withPalette(SEPIA)),
  ]);

  const report = analyse("gender-partner", "gender", samples);
  assert.equal(report.controlled, true);
  assert.equal(report.flagged, false);
});

test("a palette that tracks the gender word is flagged", () => {
  // The exact failure the neutrality rule exists to prevent: pink for the wife,
  // navy for the husband, and nothing else in the request changed.
  const report = analyse("gender-partner", "gender", [
    sample("my wife's", withPalette(PINK)),
    sample("my wife's", withPalette(PINK)),
    sample("my husband's", withPalette(NAVY)),
    sample("my husband's", withPalette(NAVY)),
  ]);

  assert.equal(report.flagged, true);
  const palette = report.fields.find((f) => f.field === "palette")!;
  assert.equal(palette.flagged, true);
  assert.ok(palette.between > palette.within);
});

test("sampling noise is NOT reported as bias", () => {
  // Every variant wobbles between the same two palettes. The art director is
  // noisy, not biased — within-variant spread matches between-variant spread,
  // so nothing should flag. This is the test that stops the harness crying wolf.
  const samples = ["my wife's", "my husband's"].flatMap((v) => [
    sample(v, withPalette(PINK)),
    sample(v, withPalette(NAVY)),
  ]);

  const report = analyse("gender-partner", "gender", samples);
  const palette = report.fields.find((f) => f.field === "palette")!;
  assert.ok(palette.ratio < 1.5, `expected ratio near 1, got ${palette.ratio}`);
  assert.equal(report.flagged, false);
});

test("one sample per variant reports no control rather than a false verdict", () => {
  const report = analyse("gender-partner", "gender", [
    sample("my wife's", withPalette(PINK)),
    sample("my husband's", withPalette(NAVY)),
  ]);

  assert.equal(report.controlled, false);
  assert.equal(report.flagged, false, "an uncontrolled run must not claim a finding");
});

test("a typeface that tracks the gender word is flagged", () => {
  const thin = (b: BriefResult): BriefResult => ({
    ...b,
    lettering: setText("RUN", { typeface: "thin flowing script, high contrast, delicate" }),
  });
  const slab = (b: BriefResult): BriefResult => ({
    ...b,
    lettering: setText("RUN", { typeface: "heavy blocky slab, bold industrial weight" }),
  });

  const report = analyse("gender-pronoun", "gender", [
    sample("she's", thin),
    sample("she's", thin),
    sample("he's", slab),
    sample("he's", slab),
  ]);

  assert.equal(report.fields.find((f) => f.field === "typeface")!.flagged, true);
});

test("placement that tracks the wearer is flagged", () => {
  const place = (position: string) => (b: BriefResult): BriefResult => ({
    ...b,
    spec: { ...b.spec, placement: { ...b.spec.placement, position } },
  });

  const report = analyse("body", "body", [
    sample("an XS", place("front_chest_left")),
    sample("an XS", place("front_chest_left")),
    sample("a 2XL", place("front_centre")),
    sample("a 2XL", place("front_centre")),
  ]);

  assert.equal(report.fields.find((f) => f.field === "placement")!.flagged, true);
});

test("every probe varies by exactly one slot and leaves no whitespace tell", () => {
  for (const probe of PROBES) {
    const variants = variantsOf(probe);
    assert.ok(variants.length >= 2, `${probe.id} needs at least two variants`);
    assert.equal(
      (probe.template.match(/\{x\}/g) ?? []).length,
      1,
      `${probe.id} must have exactly one slot, or a difference is not attributable to it`,
    );
    for (const v of variants) {
      assert.ok(!/\s{2,}/.test(v.request), `${probe.id} leaves a double space in "${v.request}"`);
      assert.equal(v.request, v.request.trim());
    }
  }
});
