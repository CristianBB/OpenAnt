import { zodToJsonSchema } from "zod-to-json-schema";
import { loadAgentInstructions } from "./load-instructions.js";
import { taskAssignmentResultSchema, type TaskAssignmentResult } from "./schemas.js";
import type { ILLMProvider } from "../llm/provider.js";
import { getLogger } from "../lib/logger.js";

interface TaskAssignmentInput {
  newTask: { id: string; title: string; description: string };
  candidateTasks: Array<{ id: string; title: string; description: string; status: string }>;
  workGroups: Array<{ id: string; name: string; summary: string; status: string }>;
  projectRules: string;
  repoSummaries: Array<{ id: string; name: string; analysis: unknown }>;
}

const jsonSchema = zodToJsonSchema(taskAssignmentResultSchema) as Record<string, unknown>;

export async function assignTask(
  provider: ILLMProvider,
  model: string,
  input: TaskAssignmentInput
): Promise<TaskAssignmentResult> {
  const log = getLogger();
  const instructions = loadAgentInstructions("task-assignment");

  const userContent = JSON.stringify(input);

  const completion = await provider.chat({
    model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userContent },
    ],
    jsonSchema,
    jsonSchemaStrict: true,
    temperature: 0.2,
    maxTokens: 4096,
  });

  try {
    const parsed = JSON.parse(completion.content);
    return taskAssignmentResultSchema.parse(parsed);
  } catch (err) {
    log.error({ err, content: completion.content }, "Failed to parse task assignment result");
    return {
      action: "no_change",
      targetGroupId: null,
      targetTaskId: null,
      newGroup: null,
      links: [],
      impacts: [],
      reason: "Failed to parse LLM response",
    };
  }
}
