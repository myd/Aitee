import { readFileSync } from "node:fs";
import type { Flag } from "./policy";
import { DEFAULT_BLOCKED_TERMS } from "./blocked-terms";

/**
 * The local pre-screen: deterministic, free, and offline.
 *
 * It is NOT the real filter. Its two jobs are to stop the blatant cases before
 * we pay for tokens, and to make sure an API outage fails closed instead of
 * open. Everything subtle is caught downstream by the model reviews.
 */

/**
 * Patterns matched against the RAW text, where digits and punctuation carry the
 * meaning and so must survive normalisation.
 */
const RAW_PATTERNS: ReadonlyArray<[Flag, RegExp]> = [
  ["hate_or_extremism", /\b(?:1488|14\s*88|88\s*14|6mwe)\b/i],
  [
    "private_data_or_scannable_code",
    /\b(?:qr[\s-]?codes?|bar[\s-]?codes?|scan(?:nable)?\s+codes?)\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b(?:\d{4}[-\s]){3}\d{4}\b/i,
  ],
  ["targets_real_person", /\(\(\(.+?\)\)\)/],
];

/**
 * Folds away the usual evasions — case, accents, leetspeak, padding characters
 * and stretched letters — so "n i c e", "n1c3" and "nïçe" all collapse to the
 * same string before we go looking for a term.
 */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[4310$57]/g, (c) => ({ "4": "a", "3": "e", "1": "i", "0": "o", "$": "s", "5": "s", "7": "t" })[c]!)
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1+/g, "$1");
}

export interface Screening {
  blocked: boolean;
  flags: Flag[];
  matches: string[];
}

let cachedTerms: string[] | null = null;

/**
 * The built-in list, plus any operator-supplied overlay. The overlay is
 * additive by design: a misconfigured or unreadable path degrades the gate to
 * the built-in terms, never to nothing.
 */
function blockedTerms(): string[] {
  if (cachedTerms) return cachedTerms;

  const terms = [...DEFAULT_BLOCKED_TERMS];
  const overlayPath = process.env.BLOCKED_TERMS_PATH;

  if (overlayPath) {
    try {
      const raw = readFileSync(/* turbopackIgnore: true */ overlayPath, "utf8");
      terms.push(
        ...raw
          .split("\n")
          .map((line) => line.replace(/#.*$/, "").trim())
          .filter((line) => line.length > 0),
      );
    } catch {
      console.error(
        `[policy] BLOCKED_TERMS_PATH set to ${overlayPath} but it could not be read; ` +
          "falling back to the built-in list only",
      );
    }
  }

  cachedTerms = terms;
  return cachedTerms;
}

export function reloadBlockedTerms(): void {
  cachedTerms = null;
}

export function prescreen(text: string): Screening {
  const flags = new Set<Flag>();
  const matches: string[] = [];

  for (const [flag, pattern] of RAW_PATTERNS) {
    const found = text.match(pattern);
    if (found) {
      flags.add(flag);
      matches.push(found[0].trim());
    }
  }

  const normalised = normalise(text);
  for (const term of blockedTerms()) {
    const needle = normalise(term);
    if (needle.length > 0 && normalised.includes(needle)) {
      flags.add("slur_or_dehumanisation");
      matches.push(term);
    }
  }

  return { blocked: flags.size > 0, flags: [...flags], matches: [...new Set(matches)] };
}
