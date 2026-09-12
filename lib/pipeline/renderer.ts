import type { RenderedImage } from "./types";

/**
 * The pipeline's seam for whatever image model the studio prints with.
 *
 * Claude writes the brief and reviews the result; it does not draw. Anything
 * implementing this interface can be dropped in — which is also how the tests
 * exercise the gates without a network call.
 */
export interface Renderer {
  render(input: { positive: string; negative: string; aspect: string }): Promise<RenderedImage>;
}

export class RendererError extends Error {}

/**
 * Deliberately explicit rather than a stub returning a placeholder. A silently
 * fake render would sail through the review stages and reach a printer, which
 * is the one failure this whole pipeline exists to prevent.
 */
export class NotConfiguredRenderer implements Renderer {
  async render(): Promise<RenderedImage> {
    throw new RendererError(
      "No image renderer configured. Pass a Renderer into the Pipeline — any object " +
        "with render({ positive, negative, aspect }) returning { data, mediaType, model }.",
    );
  }
}
