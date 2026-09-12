import type { Flag } from "../policy/policy";

/** What the intake reviewer returns. Mirrors INTAKE_SCHEMA. */
export interface IntakeResult {
  verdict: "approve" | "approve_with_constraints" | "hold_for_human" | "decline";
  risk_tier: "green" | "amber" | "red";
  flags: Flag[];
  rationale: string;
  constraints: string[];
  lettering: { wants_text: boolean; exact_string: string; uncertain: boolean };
  real_person: { depicted: boolean; kind: "none" | "public_figure" | "known_to_customer" | "unclear" };
  ip_risk: { level: "none" | "possible" | "clear"; what: string };
  customer_message: string;
}

export interface Ink {
  name: string;
  hex: string;
  role: string;
}

export interface DesignSpec {
  one_sentence: string;
  composition: string;
  focal_hierarchy: string;
  line_and_texture: string;
  palette: { garment_colour: string; inks: Ink[] };
  negative_space: string;
  placement: { position: string; printed_width_cm: number };
  omit: string[];
}

export interface Lettering {
  has_text: boolean;
  exact_string: string;
}

/** What the art director returns. Mirrors ART_DIRECTION_SCHEMA. */
export interface BriefResult {
  no_viable_concept: boolean;
  reading: {
    literal_subject: string;
    must_be_recognisable: string[];
    feeling: string;
    occasion: string;
    non_negotiables: string[];
  };
  obvious_version: string;
  concepts: Array<{ axis: string; pitch: string; at_three_metres: string; why_not_obvious: string }>;
  judgement: Array<{
    concept_index: number;
    recognisable: boolean;
    surprising: boolean;
    wearable: number;
    printable: number;
    note: string;
  }>;
  chosen_index: number;
  spec: DesignSpec;
  lettering: Lettering;
  failure_pass: Array<{ likely_error: string; counter_instruction: string }>;
}

/** What each print reviewer returns. Mirrors PRINT_REVIEW_SCHEMA. */
export interface ReviewResult {
  verdict: "pass" | "hold_for_human" | "reject";
  confidence: number;
  text_found: boolean;
  transcription: string;
  text_matches_approved: boolean;
  flags: Flag[];
  accidental_resemblance: { found: boolean; description: string };
  fidelity: { delivers_subject: boolean; note: string };
  print_problems: string[];
  note_for_human: string;
}

export interface RenderedImage {
  data: Buffer;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  model: string;
  seed?: number;
}

export type OrderStatus =
  /** Cleared every gate. Safe to send to a printer with no human in the loop. */
  | "approved_for_print"
  /** Everything is fine, but a person signs this one off before it prints. */
  | "needs_human"
  /** We are not making this. The customer is told, plainly and without a lecture. */
  | "declined";

export interface PipelineResult {
  status: OrderStatus;
  policyVersion: string;
  flags: Flag[];
  attempts: number;
  intake?: IntakeResult;
  brief?: BriefResult;
  render?: RenderedImage;
  reviews?: ReviewResult[];
  customerMessage?: string;
  error?: string;
}
