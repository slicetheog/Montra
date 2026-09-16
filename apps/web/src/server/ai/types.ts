export interface AiAssistantProvider {
  ask(params: { systemPrompt: string; userMessage: string }): Promise<string>;
}
