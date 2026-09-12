/**
 * A crude per-caller limit on order creation.
 *
 * Each order costs several frontier-model calls plus an image generation, so an
 * unthrottled endpoint is an invitation to burn a month's budget in an
 * afternoon — and a queue of junk orders is also how someone probes the policy
 * for a gap. Per-process and in-memory, so it is a speed bump, not a wall:
 * behind more than one instance, move this to Redis or your edge layer.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

export function allow(key: string): { ok: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}
