export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletion {
  content: string;
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number };
}
