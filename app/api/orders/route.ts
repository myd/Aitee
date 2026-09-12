import { NextResponse } from "next/server";
import { createOrder, customerView, updateOrder } from "@/lib/store";
import { allow } from "@/lib/rate-limit";
import { Pipeline } from "@/lib/pipeline/pipeline";
import { ClaudeJudge } from "@/lib/pipeline/claude";
import { NotConfiguredRenderer } from "@/lib/pipeline/renderer";

export const runtime = "nodejs";

const MAX_REQUEST_LENGTH = 600;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = allow(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many designs in the last hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 3600) } },
    );
  }

  let body: { request?: unknown; garment?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (request.length < 3) {
    return NextResponse.json({ error: "Tell us a little more about what you want." }, { status: 400 });
  }
  if (request.length > MAX_REQUEST_LENGTH) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_REQUEST_LENGTH} characters — a sentence or two is plenty.` },
      { status: 400 },
    );
  }

  const garment = normaliseGarment(body.garment);
  const order = createOrder(request, garment);

  // Fire and forget. The pipeline runs several frontier-model calls and an image
  // generation, which is far longer than a request should be held open — and the
  // customer has nothing to watch anyway, since they never see the design.
  //
  // This is the seam to replace with a real job queue: an in-process promise
  // does not survive a deploy, and an order lost mid-flight is one nobody ever
  // reviews.
  void process(order.id, request, garment);

  return NextResponse.json(customerView(order), { status: 202 });
}

async function process(id: string, request: string, garment: Record<string, string>) {
  updateOrder(id, { state: "working" });
  try {
    const pipeline = new Pipeline(new ClaudeJudge(), new NotConfiguredRenderer());
    const result = await pipeline.run(request, garment);
    const { render, ...audit } = result;

    updateOrder(id, {
      state: result.status,
      customerMessage: result.customerMessage,
      audit: { ...audit, renderBytes: render?.data.length },
    });
  } catch (err) {
    // Anything that escaped the pipeline's own handling. Never mark such an
    // order printable — an order we could not finish judging is one a person
    // picks up by hand.
    console.error(`[order ${id}] pipeline threw`, err);
    updateOrder(id, {
      state: "failed",
      customerMessage: "Something went wrong on our side. Nothing has been printed and you have not been charged.",
    });
  }
}

function normaliseGarment(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const allowed = ["colour", "size", "fit"];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (allowed.includes(k) && typeof v === "string" && v.length < 40) out[k] = v;
  }
  return out;
}
