/**
 * Colour distance, so a palette shift between two briefs is a number rather
 * than an opinion.
 *
 * Deliberately crude and deliberately transparent: the point is not
 * perceptual accuracy, it is that "pink vs navy" scores far apart and
 * "#4A3728 vs #4B3729" scores near zero, using arithmetic anyone can audit.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;

  return { h, s, l };
}

/**
 * 0 = same colour, 1 = about as different as colours get. Hue only counts to
 * the extent both colours are saturated enough for hue to mean anything —
 * otherwise two near-greys with wildly different nominal hues would read as
 * opposites.
 */
export function colourDistance(a: string, b: string): number {
  const x = hexToHsl(a);
  const y = hexToHsl(b);
  if (!x || !y) return 0;

  const rawHue = Math.abs(x.h - y.h);
  const hue = Math.min(rawHue, 360 - rawHue) / 180;
  const hueWeight = Math.min(x.s, y.s);

  return hue * hueWeight * 0.6 + Math.abs(x.s - y.s) * 0.2 + Math.abs(x.l - y.l) * 0.2;
}

/**
 * Distance between two palettes, as the mean nearest-neighbour distance in
 * both directions. Symmetric, and tolerant of the palettes having different
 * numbers of inks.
 */
export function paletteDistance(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 0 : 1;

  const nearest = (from: string[], to: string[]) =>
    from.reduce((sum, c) => sum + Math.min(...to.map((d) => colourDistance(c, d))), 0) / from.length;

  return (nearest(a, b) + nearest(b, a)) / 2;
}
