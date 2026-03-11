import type { ILLMProvider, ChatParams } from "./provider.js";
import type { ChatCompletion } from "./types.js";
import { getLogger } from "../lib/logger.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements ILLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async chat(params: ChatParams): Promise<ChatCompletion> {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 4096,
    };

    if (params.tools) {
      body.tools = params.tools;
    }

    if (params.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "response",
          schema: params.jsonSchema,
          strict: params.jsonSchemaStrict ?? false,
        },
      };
    }

    const log = getLogger();
    log.debug({ model: params.model, messageCount: params.messages.length, messages: params.messages }, "LLM request");

    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://openant.dev",
        "X-Title": "OpenAnt",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    log.debug(
      { model: params.model, finishReason: choice.finish_reason, usage: data.usage, response: choice.message.content },
      "LLM response"
    );

    return {
      content: choice.message.content,
      finishReason: choice.finish_reason,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined,
    };
  }
}
