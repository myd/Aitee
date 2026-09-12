import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper over the Anthropic SDK.
 *
 * It exists for three reasons: every call in this pipeline wants a
 * schema-validated object rather than prose, every call needs the same refusal
 * and error handling, and the tests need one seam to fake instead of four.
 */

export class ClaudeError extends Error {}
export class ClaudeRefused extends ClaudeError {}

export type MessageContent = string | Array<Record<string, unknown>>;

export interface StructuredCall {
  model: string;
  system: string;
  content: MessageContent;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
}

/** The seam the pipeline depends on. Tests supply their own implementation. */
export interface Judge {
  structured<T>(call: StructuredCall): Promise<T>;
}

export class ClaudeJudge implements Judge {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  /**
   * Returns the object described by `schema`.
   *
   * Structured outputs make the parse deterministic. Without a schema, a
   * reviewer's rationale containing a quotation mark is enough to break a
   * hand-rolled JSON parse — and a broken parse on a safety check has to fail
   * closed, which means a refused order for a customer who did nothing wrong.
   */
  async structured<T>({ model, system, content, schema, effort = "high", maxTokens = 16000 }: StructuredCall): Promise<T> {
    let message;
    try {
      message = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort, format: { type: "json_schema", schema } },
        // The system prompt carries the full policy document and is byte-identical
        // across every order, so it is the obvious cache breakpoint. The volatile
        // part — this customer's request — sits after it in the messages array.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: content as never }],
      } as never);
    } catch (err) {
      throw new ClaudeError(`Claude request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const response = message as {
      stop_reason?: string;
      stop_details?: { category?: string | null } | null;
      content: Array<{ type: string; text?: string }>;
    };

    if (response.stop_reason === "refusal") {
      throw new ClaudeRefused(
        `model declined to respond (${response.stop_details?.category ?? "unspecified"})`,
      );
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    if (text.trim().length === 0) throw new ClaudeError("model returned no content");

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new ClaudeError(`could not parse model response: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
