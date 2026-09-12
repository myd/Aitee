/**
 * Every tunable in one place, so the safety posture of the studio can be read
 * off a single object rather than reconstructed from call sites.
 */
export interface StudioConfig {
  /** Claude does the judging and the art direction — three very different jobs. */
  intakeModel: string;
  artDirectionModel: string;
  /**
   * Two independent reviews of the finished artwork, both of which must pass.
   * Set the second to a different model where one is available: two models
   * rarely share a blind spot, and catching what the pipeline did not intend is
   * the entire point of that stage.
   */
  reviewModels: string[];

  /**
   * How hard each stage may think. Intake is high-volume classification and runs
   * cheaper; art direction and final review are where being right matters more
   * than being quick.
   */
  intakeEffort: "low" | "medium" | "high" | "xhigh" | "max";
  artDirectionEffort: "low" | "medium" | "high" | "xhigh" | "max";
  reviewEffort: "low" | "medium" | "high" | "xhigh" | "max";

  /** A rendered design must clear this to pass automatically. Below it, a person looks. */
  reviewConfidenceThreshold: number;

  /**
   * Every design containing a visible character is held for a human, even when
   * the text is exactly what the customer asked for. Misspellings and
   * letterforms that assemble into something unintended are the most common way
   * a print goes wrong, and the customer cannot catch it for us. Turning this
   * off is a deliberate decision to ship typos.
   */
  alwaysHoldText: boolean;

  /**
   * How many times we re-render after a craft failure (a cropped element, a
   * sixth colour, a mangled hand). Safety failures are never retried.
   */
  maxRenderAttempts: number;
}

export const defaultConfig: StudioConfig = {
  intakeModel: "claude-opus-5",
  artDirectionModel: "claude-opus-5",
  reviewModels: ["claude-opus-5", "claude-opus-5"],

  intakeEffort: "medium",
  artDirectionEffort: "high",
  reviewEffort: "high",

  reviewConfidenceThreshold: 0.9,
  alwaysHoldText: true,
  maxRenderAttempts: 2,
};
