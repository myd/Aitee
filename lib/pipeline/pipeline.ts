import { POLICY_VERSION, HARD_FLAGS, ESCALATION_FLAGS, type Flag } from "../policy/policy";
import { prescreen } from "../policy/blocklist";
import { intakeSystem, intakeUser, INTAKE_SCHEMA } from "../prompts/intake-screen";
import { ART_DIRECTION_SYSTEM, ART_DIRECTION_SCHEMA, artDirectionUser } from "../prompts/art-direction";
import { positivePrompt, negativePrompt } from "../prompts/render-brief";
import { printReviewSystem, printReviewContent, PRINT_REVIEW_SCHEMA } from "../prompts/print-review";
import { ClaudeError, type Judge } from "./claude";
import { RendererError, type Renderer } from "./renderer";
import { checkAestheticGrounding } from "./grounding";
import { defaultConfig, type StudioConfig } from "./config";
import type {
  BriefResult,
  IntakeResult,
  Lettering,
  PipelineResult,
  RenderedImage,
  ReviewResult,
} from "./types";

/**
 * What a customer sees when we say no. Plain, short, and not a lecture — most
 * declines are people who did not think it through, not people trying it on.
 */
const DECLINE_MESSAGE =
  "We can't print this one. Our studio doesn't produce designs that could put someone " +
  "at risk or use artwork we don't have the rights to. Send us another idea and we'll " +
  "get straight on it.";

type Adjudication =
  | { status: "approved_for_print"; flags: Flag[] }
  | { status: "needs_human"; flags: Flag[] }
  | { status: "rejected_unsafe"; flags: Flag[] }
  | { status: "retry"; flags: Flag[]; feedback: string[] };

/**
 * Orchestrates the four stages and — more importantly — owns the decisions
 * between them.
 *
 * The gates below are deliberately in TypeScript rather than in a prompt. A
 * model decides what it sees; code decides what that means for the order. That
 * split is what makes the safety posture auditable: you can read this class and
 * know exactly what it takes for a design to reach a printer unseen, and you
 * can change a threshold without rewording a paragraph and hoping.
 */
export class Pipeline {
  constructor(
    private judge: Judge,
    private renderer: Renderer,
    private config: StudioConfig = defaultConfig,
  ) {}

  async run(request: string, garment: Record<string, string> = {}): Promise<PipelineResult> {
    const flags = new Set<Flag>();
    let attempts = 0;

    try {
      // ── Gate 0: local pre-screen ──────────────────────────────────────────
      // Costs nothing, catches the blatant, and means an API outage cannot fail
      // open — if Claude is unreachable the order stops here rather than sliding
      // through unchecked.
      const screening = prescreen(request);
      if (screening.blocked) {
        return this.result("declined", {
          flags: screening.flags,
          customerMessage: DECLINE_MESSAGE,
        });
      }

      // ── Stage 1: intake ───────────────────────────────────────────────────
      const intake = await this.judge.structured<IntakeResult>({
        model: this.config.intakeModel,
        system: intakeSystem(),
        content: intakeUser(request, garment),
        schema: INTAKE_SCHEMA as unknown as Record<string, unknown>,
        effort: this.config.intakeEffort,
      });
      for (const f of intake.flags ?? []) flags.add(f);

      if (intake.verdict === "decline") {
        return this.result("declined", {
          intake,
          flags: [...flags],
          customerMessage: intake.customer_message?.trim() || DECLINE_MESSAGE,
        });
      }
      if (intake.verdict === "hold_for_human") {
        return this.result("needs_human", { intake, flags: [...flags] });
      }

      // Words the customer wants printed but did not pin down exactly are not
      // something to guess at. A guessed word is printed in ink.
      if (intake.lettering?.uncertain) {
        return this.result("needs_human", { intake, flags: [...flags] });
      }

      const approvedText = intake.lettering?.wants_text ? intake.lettering.exact_string : null;

      // ── Stage 2: art direction ────────────────────────────────────────────
      const brief = await this.judge.structured<BriefResult>({
        model: this.config.artDirectionModel,
        system: ART_DIRECTION_SYSTEM,
        content: artDirectionUser({
          request,
          constraints: intake.constraints ?? [],
          approvedText,
          garment,
        }),
        schema: ART_DIRECTION_SCHEMA as unknown as Record<string, unknown>,
        effort: this.config.artDirectionEffort,
      });

      if (brief.no_viable_concept) {
        return this.result("declined", {
          intake,
          brief,
          flags: [...flags],
          customerMessage: DECLINE_MESSAGE,
        });
      }

      // The aesthetic must be traceable to the customer's own words. This is
      // also how the neutrality rule is enforced: a shirt is for everyone, so no
      // palette, motif, size or placement may come from an assumption about who
      // is wearing it. We cannot read the model's reasons, but we can require it
      // to show its working — and a stereotype has nothing to quote. An
      // aesthetic we cannot trace does not print unseen.
      const grounding = checkAestheticGrounding(brief, request);
      if (!grounding.grounded) {
        return this.result("needs_human", {
          intake,
          brief,
          flags: [...flags],
          grounding,
        });
      }

      // The art director is told what lettering was approved, but it does not get
      // to be the one who decides. Anything it put in that field which intake did
      // not approve is stripped before it can reach the renderer.
      const lettering = reconcileLettering(approvedText);

      // ── Stages 3 and 4: render, then review, up to N attempts ─────────────
      let feedback: string[] = [];
      let lastRender: RenderedImage | undefined;
      let lastReviews: ReviewResult[] | undefined;

      while (attempts < this.config.maxRenderAttempts) {
        attempts += 1;

        const counters = [
          ...(brief.failure_pass ?? []).map((f) => f.counter_instruction),
          ...feedback,
        ];

        const rendered = await this.renderer.render({
          positive: positivePrompt(brief.spec, lettering, counters, brief.aesthetic),
          negative: negativePrompt(brief.spec, lettering),
          aspect: "1:1",
        });

        const reviews = await this.reviewPanel(rendered, request, brief, lettering);
        const decision = this.adjudicate(reviews, intake);
        for (const f of decision.flags) flags.add(f);

        lastRender = rendered;
        lastReviews = reviews;

        if (decision.status === "approved_for_print" || decision.status === "needs_human") {
          return this.result(decision.status, {
            intake,
            brief,
            render: rendered,
            reviews,
            flags: [...flags],
            attempts,
            grounding,
          });
        }

        if (decision.status === "rejected_unsafe") {
          // A safety failure is not retried. Re-rolling the same brief is likely
          // to reproduce it, and a design that has once come back carrying a
          // policy breach is not one to keep rolling dice on.
          return this.result("declined", {
            intake,
            brief,
            render: rendered,
            reviews,
            flags: [...flags],
            attempts,
            grounding,
            customerMessage: DECLINE_MESSAGE,
          });
        }

        feedback = decision.feedback;
      }

      // Out of attempts on craft problems alone. Nothing unsafe was found, so
      // this is a quality question, and a person decides whether it ships.
      return this.result("needs_human", {
        intake,
        brief,
        render: lastRender,
        reviews: lastReviews,
        flags: [...flags],
        attempts,
        grounding,
      });
    } catch (err) {
      if (err instanceof ClaudeError || err instanceof RendererError) {
        // Fail closed. An order we could not finish reviewing is an order a
        // person looks at, never one that quietly proceeds to print.
        return this.result("needs_human", { flags: [...flags], attempts, error: err.message });
      }
      throw err;
    }
  }

  /**
   * Two independent looks at the finished artwork, neither aware of the other.
   * Both must pass. A second opinion is cheap next to a printed garment, and
   * independent reviewers rarely share a blind spot.
   */
  private async reviewPanel(
    rendered: RenderedImage,
    request: string,
    brief: BriefResult,
    lettering: Lettering,
  ): Promise<ReviewResult[]> {
    const imageBase64 = rendered.data.toString("base64");
    return Promise.all(
      this.config.reviewModels.map((model) =>
        this.judge.structured<ReviewResult>({
          model,
          system: printReviewSystem(),
          content: printReviewContent({
            imageBase64,
            mediaType: rendered.mediaType,
            request,
            spec: brief.spec,
            lettering,
          }),
          schema: PRINT_REVIEW_SCHEMA as unknown as Record<string, unknown>,
          effort: this.config.reviewEffort,
        }),
      ),
    );
  }

  /**
   * The gate. Every rule here is one a studio should be able to state out loud
   * to a customer whose parcel went wrong.
   */
  adjudicate(reviews: ReviewResult[], intake: IntakeResult): Adjudication {
    const flags = [...new Set(reviews.flatMap((r) => r.flags ?? []))];

    // 1. A policy breach in the artwork ends the order outright — as does an
    //    unintended resemblance, which is a breach the renderer did not know it
    //    was committing.
    const hard = flags.filter((f) => HARD_FLAGS.includes(f));
    const resemblance = reviews.some((r) => r.accidental_resemblance?.found);
    if (hard.length > 0 || resemblance) {
      return { status: "rejected_unsafe", flags };
    }

    // 2. Any dissent at all sends it to a person. Unanimity is the bar.
    if (reviews.some((r) => r.verdict === "hold_for_human")) {
      return { status: "needs_human", flags };
    }

    // 3. Low confidence is a hold regardless of the stated verdict.
    if (reviews.some((r) => (r.confidence ?? 0) < this.config.reviewConfidenceThreshold)) {
      return { status: "needs_human", flags };
    }

    // 4. Ink on the shirt that says words gets human eyes, every time —
    //    including when the words are exactly the ones ordered.
    if (this.config.alwaysHoldText && reviews.some((r) => r.text_found)) {
      return { status: "needs_human", flags: [...new Set([...flags, "contains_text" as Flag])] };
    }

    // 5. The customer's own request was already escalation-worthy. Passing
    //    review does not clear that; a person still looks.
    const intakeFlags = intake.flags ?? [];
    if (intake.risk_tier === "amber" || intakeFlags.some((f) => ESCALATION_FLAGS.includes(f))) {
      return { status: "needs_human", flags };
    }

    // 6. Craft failures. Worth another attempt, with the reviewers' own words
    //    fed back as counter-instructions.
    const rejected = reviews.filter((r) => r.verdict === "reject");
    if (rejected.length > 0) {
      const feedback = rejected.flatMap((r) => r.print_problems ?? []);
      if (reviews.some((r) => r.fidelity?.delivers_subject === false)) {
        feedback.push("The subject must be unmistakably what the customer asked for.");
      }
      return { status: "retry", flags, feedback: [...new Set(feedback)] };
    }

    // Wrong words are a craft failure too — but never one we print through.
    if (!reviews.every((r) => r.text_matches_approved)) {
      return { status: "needs_human", flags: [...new Set([...flags, "contains_text" as Flag])] };
    }

    // Every gate cleared, unanimously and confidently. This one prints unseen.
    return { status: "approved_for_print", flags };
  }

  private result(
    status: PipelineResult["status"],
    attrs: Partial<Omit<PipelineResult, "status" | "policyVersion">> = {},
  ): PipelineResult {
    return {
      status,
      policyVersion: POLICY_VERSION,
      flags: attrs.flags ?? [],
      attempts: attrs.attempts ?? 0,
      ...attrs,
    };
  }
}

/**
 * Intake decides whether words are printed; the art director only decides how
 * they are set. If a brief comes back carrying lettering intake never approved,
 * it is dropped rather than argued with.
 */
export function reconcileLettering(approvedText: string | null): Lettering {
  if (!approvedText || approvedText.length === 0) {
    return { has_text: false, exact_string: "" };
  }
  return { has_text: true, exact_string: approvedText };
}
