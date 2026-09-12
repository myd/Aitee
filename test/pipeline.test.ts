import { test } from "node:test";
import assert from "node:assert/strict";
import { Pipeline } from "../lib/pipeline/pipeline";
import { ClaudeError } from "../lib/pipeline/claude";
import { RendererError, type Renderer } from "../lib/pipeline/renderer";
import { defaultConfig } from "../lib/pipeline/config";
import { FakeJudge, FakeRenderer, brief, intake, review, setText } from "./fixtures";

const REQUEST = "my corgi, but make it interesting";

function build(script: ConstructorParameters<typeof FakeJudge>[0], renderer?: Renderer) {
  const judge = new FakeJudge(script);
  const fakeRenderer = (renderer as FakeRenderer) ?? new FakeRenderer();
  return { judge, renderer: fakeRenderer, pipeline: new Pipeline(judge, fakeRenderer) };
}

test("a pre-screened request is declined without spending a single token", async () => {
  const { pipeline, judge, renderer } = build({});
  const result = await pipeline.run("a shirt with 1488 on it");

  assert.equal(result.status, "declined");
  assert.equal(judge.calls.length, 0, "no model should be called");
  assert.equal(renderer.calls.length, 0, "nothing should be rendered");
  assert.ok(result.customerMessage);
});

test("a clean, wordless, unanimous design prints unseen", async () => {
  const { pipeline, renderer } = build({
    intake: intake(),
    brief: brief(),
    reviews: [[review(), review()]],
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "approved_for_print");
  assert.equal(result.attempts, 1);
  assert.equal(renderer.calls.length, 1);
});

test("intake declining ends the order and carries its own words to the customer", async () => {
  const { pipeline, renderer } = build({
    intake: intake({ verdict: "decline", risk_tier: "red", customer_message: "We can't print that mark." }),
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "declined");
  assert.equal(result.customerMessage, "We can't print that mark.");
  assert.equal(renderer.calls.length, 0);
});

test("intake asking for a human stops before any art is made", async () => {
  const { pipeline, renderer } = build({ intake: intake({ verdict: "hold_for_human", risk_tier: "amber" }) });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.equal(renderer.calls.length, 0);
});

test("words the customer did not pin down are never guessed at", async () => {
  const { pipeline, renderer } = build({
    intake: intake({ lettering: { wants_text: true, exact_string: "", uncertain: true } }),
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.equal(renderer.calls.length, 0);
});

test("a policy breach in the finished artwork is never re-rolled", async () => {
  const { pipeline, renderer } = build({
    intake: intake(),
    brief: brief(),
    reviews: [[review({ verdict: "reject", flags: ["hate_or_extremism"] }), review()]],
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "declined");
  assert.equal(renderer.calls.length, 1, "a safety failure must not trigger a retry");
  assert.ok(result.flags.includes("hate_or_extremism"));
});

test("an unintended resemblance is treated as a breach, not a blemish", async () => {
  const { pipeline, renderer } = build({
    intake: intake(),
    brief: brief(),
    reviews: [
      [
        review(),
        review({ accidental_resemblance: { found: true, description: "the rosette reads as a swastika when squinted at" } }),
      ],
    ],
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "declined");
  assert.equal(renderer.calls.length, 1);
});

test("one dissenting reviewer is enough to hold the order", async () => {
  const { pipeline } = build({
    intake: intake(),
    brief: brief(),
    reviews: [[review(), review({ verdict: "hold_for_human", note_for_human: "check the paws" })]],
  });

  assert.equal((await pipeline.run(REQUEST)).status, "needs_human");
});

test("a confident-sounding pass below the threshold still goes to a person", async () => {
  const { pipeline } = build({
    intake: intake(),
    brief: brief(),
    reviews: [[review(), review({ verdict: "pass", confidence: 0.7 })]],
  });

  assert.equal((await pipeline.run(REQUEST)).status, "needs_human");
});

test("any lettering at all is held, even when both reviewers pass it", async () => {
  const { pipeline } = build({
    intake: intake({ lettering: { wants_text: true, exact_string: "SLOW CLUB", uncertain: false } }),
    brief: brief({ lettering: setText("SLOW CLUB") }),
    reviews: [
      [
        review({ text_found: true, transcription: "SLOW CLUB" }),
        review({ text_found: true, transcription: "SLOW CLUB" }),
      ],
    ],
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.ok(result.flags.includes("contains_text"));
});

test("an amber intake still requires a human even when the artwork sails through", async () => {
  const { pipeline } = build({
    intake: intake({ verdict: "approve_with_constraints", risk_tier: "amber", constraints: ["no visible face"] }),
    brief: brief(),
    reviews: [[review(), review()]],
  });

  assert.equal((await pipeline.run(REQUEST)).status, "needs_human");
});

test("a craft failure is retried with the reviewers' own words, then handed over", async () => {
  const { pipeline, renderer } = build({
    intake: intake(),
    brief: brief(),
    reviews: [
      [review({ verdict: "reject", print_problems: ["the ear is cropped at the edge"] }), review()],
      [review({ verdict: "reject", print_problems: ["still cropped"] }), review()],
    ],
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.equal(result.attempts, defaultConfig.maxRenderAttempts);
  assert.equal(renderer.calls.length, 2);
  assert.match(renderer.calls[1].positive, /the ear is cropped at the edge/);
});

test("text that does not match what was approved never prints through", async () => {
  const { pipeline } = build({
    intake: intake({ lettering: { wants_text: true, exact_string: "SLOW CLUB", uncertain: false } }),
    brief: brief({ lettering: setText("SLOW CLUB") }),
    reviews: [
      [
        review({ text_found: false, text_matches_approved: false }),
        review({ text_found: false, text_matches_approved: false }),
      ],
    ],
  });

  assert.equal((await pipeline.run(REQUEST)).status, "needs_human");
});

test("an unreachable model fails closed, never open", async () => {
  const { pipeline } = build({ intake: new ClaudeError("connection reset") });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.match(result.error ?? "", /connection reset/);
});

test("a renderer outage fails closed too", async () => {
  const renderer = new FakeRenderer(() => {
    throw new RendererError("image service unavailable");
  });
  const { pipeline } = build({ intake: intake(), brief: brief() }, renderer);

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.match(result.error ?? "", /image service unavailable/);
});

test("the art director cannot smuggle in lettering intake never approved", async () => {
  const { pipeline, renderer } = build({
    intake: intake({ lettering: { wants_text: false, exact_string: "", uncertain: false } }),
    brief: brief({ lettering: setText("GOOD BOY") }),
    reviews: [[review(), review()]],
  });

  await pipeline.run(REQUEST);
  assert.match(renderer.calls[0].positive, /LETTERING: none/);
  assert.ok(!renderer.calls[0].positive.includes("GOOD BOY"));
});

test("an aesthetic that cannot be traced to the customer's words never prints unseen", async () => {
  const { pipeline, renderer } = build({
    intake: intake(),
    brief: brief({
      aesthetic: {
        register: "feminine",
        world: "soft pastels and florals",
        signal_strength: "implied",
        evidence: [{ quote: "she'll love something pretty", reads_as: "soft palette" }],
        chosen_without_signal_because: "",
      },
    }),
    reviews: [[review(), review()]],
  });

  const result = await pipeline.run(REQUEST);
  assert.equal(result.status, "needs_human");
  assert.equal(result.grounding?.grounded, false);
  assert.equal(renderer.calls.length, 0, "nothing should be rendered from an untraceable aesthetic");
});

test("the aesthetic reaches the renderer, ahead of the composition", async () => {
  const { pipeline, renderer } = build({
    intake: intake(),
    brief: brief(),
    reviews: [[review(), review()]],
  });

  await pipeline.run(REQUEST);
  assert.match(renderer.calls[0].positive, /AESTHETIC: deadpan field-guide linework/);
  assert.ok(
    renderer.calls[0].positive.indexOf("AESTHETIC:") < renderer.calls[0].positive.indexOf("COMPOSITION:"),
    "the aesthetic governs how everything else is drawn, so it leads",
  );
});

test("every result records the policy version it was judged against", async () => {
  const { pipeline } = build({ intake: intake(), brief: brief(), reviews: [[review(), review()]] });
  const result = await pipeline.run(REQUEST);
  assert.match(result.policyVersion, /^\d{4}-\d{2}-\d{2}$/);
});
