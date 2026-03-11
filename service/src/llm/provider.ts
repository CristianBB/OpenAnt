import type { ChatMessage, ChatCompletion, ChatTool } from "./types.js";

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  jsonSchema?: Record<string, unknown>;
  jsonSchemaStrict?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ILLMProvider {
  chat(params: ChatParams): Promise<ChatCompletion>;
}
