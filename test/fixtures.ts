import type { BriefResult, IntakeResult, RenderedImage, ReviewResult } from "../lib/pipeline/types";
import type { Judge, StructuredCall } from "../lib/pipeline/claude";
import type { Renderer } from "../lib/pipeline/renderer";

export function intake(overrides: Partial<IntakeResult> = {}): IntakeResult {
  return {
    verdict: "approve",
    risk_tier: "green",
    flags: [],
    rationale: "ordinary request",
    constraints: [],
    lettering: { wants_text: false, exact_string: "", uncertain: false },
    real_person: { depicted: false, kind: "none" },
    ip_risk: { level: "none", what: "" },
    customer_message: "",
    ...overrides,
  };
}

export function brief(overrides: Partial<BriefResult> = {}): BriefResult {
  return {
    no_viable_concept: false,
    reading: {
      literal_subject: "a corgi",
      must_be_recognisable: ["corgi"],
      feeling: "affection",
      occasion: "",
      non_negotiables: [],
    },
    obvious_version: "a corgi head, centred, in flat vector",
    concepts: [],
    judgement: [],
    chosen_index: 0,
    spec: {
      one_sentence: "A corgi rendered as a Victorian botanical plate specimen.",
      composition: "Single specimen, off-centre left, label plate lower right.",
      focal_hierarchy: "The silhouette, then the paws, then the plate.",
      line_and_texture: "Fine engraved hatching, single weight.",
      palette: {
        garment_colour: "bone",
        inks: [{ name: "sepia", hex: "#4A3728", role: "line" }],
      },
      negative_space: "Generous margin; the plate breathes.",
      placement: { position: "front_centre", printed_width_cm: 26 },
      omit: ["collar", "name tag"],
    },
    lettering: { has_text: false, exact_string: "" },
    failure_pass: [{ likely_error: "drifts toward a shiba", counter_instruction: "Short legs, long body." }],
    ...overrides,
  };
}

export function review(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    verdict: "pass",
    confidence: 0.97,
    text_found: false,
    transcription: "",
    text_matches_approved: true,
    flags: [],
    accidental_resemblance: { found: false, description: "" },
    fidelity: { delivers_subject: true, note: "clearly a corgi" },
    print_problems: [],
    note_for_human: "",
    ...overrides,
  };
}

export function rendered(): RenderedImage {
  return { data: Buffer.from("fake-png-bytes"), mediaType: "image/png", model: "test-renderer" };
}

/**
 * A Judge that answers from a script rather than the network. Records every
 * call so a test can assert not just the outcome but what the pipeline asked.
 */
export class FakeJudge implements Judge {
  calls: StructuredCall[] = [];

  constructor(
    private script: {
      intake?: IntakeResult | Error;
      brief?: BriefResult | Error;
      reviews?: Array<ReviewResult[] | Error>;
    },
  ) {}

  private reviewRound = 0;

  async structured<T>(call: StructuredCall): Promise<T> {
    this.calls.push(call);

    // Distinguish stages by the schema's shape rather than by call order, so a
    // test stays correct if the pipeline reorders its work.
    const props = Object.keys((call.schema as { properties: object }).properties);

    if (props.includes("risk_tier")) return resolve(this.script.intake) as T;
    if (props.includes("obvious_version")) return resolve(this.script.brief) as T;

    const round = this.script.reviews?.[this.reviewRound];
    const perModel = resolve(round) as ReviewResult[];
    // One entry per reviewer in the panel; advance the round once the panel is done.
    const index = this.calls.filter((c) => isReviewCall(c)).length - 1;
    const positionInRound = index % perModel.length;
    if (positionInRound === perModel.length - 1) this.reviewRound += 1;
    return perModel[positionInRound] as T;
  }
}

function isReviewCall(call: StructuredCall): boolean {
  return Object.keys((call.schema as { properties: object }).properties).includes("transcription");
}

function resolve<T>(value: T | Error | undefined): T {
  if (value instanceof Error) throw value;
  if (value === undefined) throw new Error("FakeJudge: no scripted response for this stage");
  return value;
}

/** Counts renders so a test can prove a safety failure was not retried. */
export class FakeRenderer implements Renderer {
  calls: Array<{ positive: string; negative: string; aspect: string }> = [];

  constructor(private behaviour: () => RenderedImage = rendered) {}

  async render(input: { positive: string; negative: string; aspect: string }): Promise<RenderedImage> {
    this.calls.push(input);
    return this.behaviour();
  }
}
