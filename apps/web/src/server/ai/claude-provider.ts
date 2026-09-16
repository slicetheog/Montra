import "server-only";
import type { AiAssistantProvider } from "./types";

/** Capped well below the model's real limit — this is a budgeting Q&A/recap feature, not a long-form writer, and every extra token is a real dollar cost. */
const MAX_OUTPUT_TOKENS = 600;

/**
 * Real Claude API integration. Only ever instantiated when
 * ANTHROPIC_API_KEY is set (see server/ai/index.ts) — importing the SDK
 * is done lazily inside the method so a deployment without it configured
 * never pays the cost of loading it, the same pattern
 * server/payments/stripe-provider.ts already uses for Stripe.
 */
export class ClaudeAssistantProvider implements AiAssistantProvider {
  async ask({ systemPrompt, userMessage }: { systemPrompt: string; userMessage: string }): Promise<string> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  }
}
