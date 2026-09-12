import { randomUUID } from "node:crypto";
import type { PipelineResult } from "./pipeline/types";

/**
 * Orders in memory.
 *
 * Deliberately the smallest thing that works so the interesting code stays
 * visible. It is NOT production storage: it does not survive a restart and does
 * not span processes. Swap it for your database before you take real money —
 * the audit trail below is the part you actually need to keep, because it is
 * what lets you answer "why did this design end up on a garment?" months later.
 */

export type OrderState = "queued" | "working" | "approved_for_print" | "needs_human" | "declined" | "failed";

export interface Order {
  id: string;
  createdAt: string;
  request: string;
  garment: Record<string, string>;
  state: OrderState;
  /** Shown to the customer. Never contains the design or the brief. */
  customerMessage?: string;
  /**
   * The audit trail: every verdict, every flag, the policy version, the prompts
   * that produced the artwork. Staff-only — this is what a human reviewer opens,
   * and what you read back after a complaint.
   */
  audit?: Omit<PipelineResult, "render"> & { renderBytes?: number };
}

const orders = new Map<string, Order>();

export function createOrder(request: string, garment: Record<string, string>): Order {
  const order: Order = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    request,
    garment,
    state: "queued",
  };
  orders.set(order.id, order);
  return order;
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function updateOrder(id: string, patch: Partial<Order>): Order | undefined {
  const existing = orders.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  orders.set(id, updated);
  return updated;
}

/** Strips everything a customer must not see — which, here, is the design itself. */
export function customerView(order: Order) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    request: order.request,
    garment: order.garment,
    state: order.state,
    customerMessage: order.customerMessage,
  };
}
