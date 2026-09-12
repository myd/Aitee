import { NextResponse } from "next/server";
import { customerView, getOrder } from "@/lib/store";

export const runtime = "nodejs";

/**
 * The customer-facing view of an order. Note what it does not return: the
 * design, the brief, the concepts, the reviewers' notes. That is the product —
 * the shirt is a surprise until it arrives — and it is also why the audit trail
 * lives behind a staff-only boundary rather than being filtered out here by
 * accident.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return NextResponse.json({ error: "No such order." }, { status: 404 });
  return NextResponse.json(customerView(order));
}
