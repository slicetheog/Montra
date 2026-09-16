import "server-only";
import type { AiAssistantProvider } from "./types";
import { ClaudeAssistantProvider } from "./claude-provider";

/**
 * The hard, deployment-level gate: whether this server even has a billed
 * Anthropic API key configured. This is checked in addition to (never
 * instead of) each user's own Settings toggle (default off) — see
 * services/ai-assistant.ts. Both must be true before a single API call is
 * ever made, so shipping this feature can never itself start costing
 * anything; that only happens once an operator deliberately adds a key.
 */
export function isAiAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAiAssistantProvider(): AiAssistantProvider | null {
  return isAiAssistantConfigured() ? new ClaudeAssistantProvider() : null;
}

export * from "./types";
