/**
 * Runs the counterfactual probes against the live art director.
 *
 *   npm run bias                 # every probe
 *   npm run bias -- gender-age   # named probes only
 *   SAMPLES=5 npm run bias       # more samples, tighter noise floor
 *
 * Exits non-zero if any probe flags, so it can gate a prompt change in CI.
 * This costs real money: probes x variants x samples calls to a frontier model.
 */
import { ClaudeJudge } from "../lib/pipeline/claude";
import { ART_DIRECTION_SYSTEM, ART_DIRECTION_SCHEMA, artDirectionUser } from "../lib/prompts/art-direction";
import { defaultConfig } from "../lib/pipeline/config";
import { PROBES, variantsOf } from "../lib/eval/probes";
import { analyse, formatReport, type Sample } from "../lib/eval/counterfactual";
import type { BriefResult } from "../lib/pipeline/types";

const SAMPLES = Number(process.env.SAMPLES ?? 3);

async function main() {
  const wanted = process.argv.slice(2);
  const probes = wanted.length > 0 ? PROBES.filter((p) => wanted.includes(p.id)) : PROBES;

  if (probes.length === 0) {
    console.error(`No probe matched. Available: ${PROBES.map((p) => p.id).join(", ")}`);
    process.exit(2);
  }
  if (SAMPLES < 2) {
    console.error("SAMPLES must be at least 2 — with one sample per variant there is no noise control.");
    process.exit(2);
  }

  const judge = new ClaudeJudge();
  let anyFlagged = false;

  for (const probe of probes) {
    const variants = variantsOf(probe);
    const calls = variants.length * SAMPLES;
    console.log(`\n${probe.id}: ${calls} calls (${variants.length} variants x ${SAMPLES} samples)`);

    // Every call is independent — no shared conversation, so one variant cannot
    // anchor the next.
    const samples: Sample[] = (
      await Promise.all(
        variants.flatMap((variant) =>
          Array.from({ length: SAMPLES }, async (): Promise<Sample> => {
            const brief = await judge.structured<BriefResult>({
              model: defaultConfig.artDirectionModel,
              system: ART_DIRECTION_SYSTEM,
              content: artDirectionUser({ request: variant.request }),
              schema: ART_DIRECTION_SCHEMA as unknown as Record<string, unknown>,
              effort: defaultConfig.artDirectionEffort,
            });
            return { variant: variant.label, brief };
          }),
        ),
      )
    ).flat();

    const report = analyse(probe.id, probe.axis, samples);
    console.log(formatReport(report));

    if (report.flagged) {
      anyFlagged = true;
      // Show the actual briefs behind a finding, so it can be judged rather
      // than taken on faith.
      for (const variant of report.variants) {
        const example = samples.find((s) => s.variant === variant)!.brief;
        const inks = example.spec.palette.inks.map((i) => `${i.name} ${i.hex}`).join(", ");
        console.log(`    ${variant.padEnd(16)} ${example.spec.palette.garment_colour} / ${inks}`);
        console.log(`    ${"".padEnd(16)} ${example.aesthetic?.world ?? ""}`);
      }
    }
  }

  console.log(anyFlagged ? "\nFAIL: at least one probe detected differential treatment." : "\nPASS: no probe flagged.");
  process.exit(anyFlagged ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
