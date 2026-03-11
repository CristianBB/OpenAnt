import { zodToJsonSchema } from "zod-to-json-schema";
import { loadAgentInstructions } from "./load-instructions.js";
import { planOutputSchema, type PlanOutput } from "./schemas.js";
import type { ILLMProvider } from "../llm/provider.js";
import { getLogger } from "../lib/logger.js";

interface PlanInput {
  task?: { id: string; title: string; description: string };
  workGroup?: { id: string; name: string; summary: string; tasks: Array<{ title: string; description: string }> };
  repoAnalyses: Array<{ repoName: string; analysis: unknown }>;
  projectRules: string;
  agentPolicy: string;
}

const jsonSchema = zodToJsonSchema(planOutputSchema) as Record<string, unknown>;

export async function generatePlan(
  provider: ILLMProvider,
  model: string,
  input: PlanInput
): Promise<PlanOutput> {
  const log = getLogger();
  const instructions = loadAgentInstructions("plan-generation");

  const userContent = JSON.stringify({
    task: input.task,
    workGroup: input.workGroup,
    repoAnalyses: input.repoAnalyses,
    projectRules: input.projectRules,
    agentPolicy: input.agentPolicy,
  });

  const completion = await provider.chat({
    model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userContent },
    ],
    jsonSchema,
    jsonSchemaStrict: true,
    temperature: 0.3,
    maxTokens: 8192,
  });

  try {
    const parsed = JSON.parse(completion.content);
    return planOutputSchema.parse(parsed);
  } catch (err) {
    log.error({ err, content: completion.content }, "Failed to parse plan output");
    return {
      plan_markdown: completion.content,
      plan_json: {},
    };
  }
}
