import type { DesignSpec, Lettering } from "../pipeline/types";

/**
 * Stage 3. Assembles the image-generation prompt from the art director's brief.
 *
 * No model call happens here — this is deterministic string building, which
 * means it can be unit tested, diffed and reasoned about.
 *
 * Two things it adds that the art director does not supply. First, the
 * production constraints that are identical on every order: we need flat
 * artwork ready for separation, not a photograph of a t-shirt. Renderers return
 * a shirt-on-a-hanger mockup unless told very plainly not to, and a mockup is
 * unprintable. Second, the standing prohibitions — no lettering we did not
 * approve, no marks, no scannable codes — restated at the point of generation,
 * because a rule enforced only at intake is a rule the renderer never heard.
 */

/** Repeated on every single render. Cheap insurance against the failures common to all designs. */
export const PRODUCTION_CONSTRAINTS = [
  "Flat artwork prepared for screen printing — the graphic itself, alone.",
  "Do NOT draw a t-shirt, garment, hanger, mannequin, model, folded fabric, seam, " +
    "stitching or product mockup of any kind. The output is the print file.",
  "Plain, perfectly flat, uniform background with no scene, no gradient, no vignette, " +
    "no paper grain and no shadow. Nothing behind the subject.",
  "Solid areas of flat colour with clean hard edges. No photographic rendering, no 3D, " +
    "no gradient mesh, no glow, no lens flare, no bokeh, no drop shadow, no chrome, no bevel.",
  "Bold enough to read at four metres; no detail finer than a shoelace.",
  "No signature, artist mark, watermark, copyright line, caption, border or frame.",
  "No company logo, brand mark, trademark or wordmark of any kind.",
  "No QR code, barcode or any other scannable code.",
] as const;

/**
 * Restated negatively as well as positively. Renderers weight a negative prompt
 * differently from an instruction, and these failures are expensive enough to
 * be worth saying twice.
 */
export const BASE_NEGATIVE = [
  "t-shirt mockup", "shirt on hanger", "clothing photo", "model wearing shirt",
  "fabric texture", "folded cloth", "product photography",
  "photorealistic", "3d render", "gradient", "glow", "lens flare", "bokeh",
  "drop shadow", "chrome", "embossed",
  "watermark", "signature", "artist name", "copyright notice",
  "frame", "border", "background scene", "sky", "landscape backdrop",
  "logo", "brand name", "trademark", "QR code", "barcode",
  "extra fingers", "deformed hands", "distorted face", "extra limbs",
  "cluttered", "busy composition", "muddy colours",
] as const;

/**
 * Added when the design is meant to be wordless — which is most of them.
 * Unwanted lettering is the most common reason a render is thrown away: models
 * sprinkle letter-like shapes into artwork unprompted, and a letter-like shape
 * on a garment reads as a typo.
 */
export const WORDLESS_NEGATIVE = [
  "text", "words", "letters", "lettering", "typography", "caption",
  "slogan", "numbers", "alphabet", "gibberish text", "garbled writing",
] as const;

function letteringInstruction(lettering: Lettering): string {
  if (lettering.has_text && lettering.exact_string.length > 0) {
    return (
      "LETTERING: the artwork contains exactly this text and no other characters " +
      `anywhere: ${JSON.stringify(lettering.exact_string)}. Spell it exactly as written, ` +
      "including capitalisation and punctuation. Every letter must be a real, correctly " +
      "formed letter. Do not add a second line, a date, a monogram, a studio mark or any " +
      "decorative lettering."
    );
  }
  return (
    "LETTERING: none. The artwork is entirely wordless. No letters, no numbers, no " +
    "punctuation, no letter-like shapes, no invented script, no signature, nothing that " +
    "could be mistaken for writing."
  );
}

export function positivePrompt(
  spec: DesignSpec,
  lettering: Lettering,
  counterInstructions: string[] = [],
): string {
  const inks = spec.palette?.inks ?? [];
  const lines: string[] = [];

  lines.push(spec.one_sentence.trim(), "");
  lines.push(`COMPOSITION: ${spec.composition}`);
  lines.push(`READS IN THIS ORDER: ${spec.focal_hierarchy}`);
  lines.push(`LINE AND TEXTURE: ${spec.line_and_texture}`);
  lines.push(`NEGATIVE SPACE: ${spec.negative_space}`);

  if (inks.length > 0) {
    const swatches = inks.map((ink) => `${ink.name} (${ink.hex}, ${ink.role})`).join("; ");
    lines.push(
      `PALETTE: exactly ${inks.length} flat ${inks.length === 1 ? "ink" : "inks"}, no more, ` +
        `no blending between them — ${swatches}.`,
    );
    if (spec.palette.garment_colour) {
      lines.push(`Designed to sit on a ${spec.palette.garment_colour} garment.`);
    }
  }

  if (spec.placement?.printed_width_cm) {
    lines.push(
      `Printed ${spec.placement.printed_width_cm} cm wide; every element must survive at that size.`,
    );
  }

  lines.push("", letteringInstruction(lettering));

  if (spec.omit?.length) {
    lines.push("", `MUST NOT APPEAR: ${spec.omit.join("; ")}.`);
  }

  const counters = counterInstructions.filter((c) => c && c.trim().length > 0);
  if (counters.length > 0) {
    lines.push("", `WATCH FOR: ${counters.join(" ")}`);
  }

  lines.push("", "PRODUCTION REQUIREMENTS:");
  for (const constraint of PRODUCTION_CONSTRAINTS) lines.push(`- ${constraint}`);

  return lines.join("\n");
}

export function negativePrompt(spec: DesignSpec, lettering: Lettering): string {
  const terms: string[] = [...BASE_NEGATIVE];
  if (!lettering.has_text) terms.push(...WORDLESS_NEGATIVE);
  terms.push(...(spec.omit ?? []));
  return [...new Set(terms)].join(", ");
}
