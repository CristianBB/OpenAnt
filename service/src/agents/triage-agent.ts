import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadAgentInstructions } from "./load-instructions.js";
import type { ILLMProvider } from "../llm/provider.js";
import { getLogger } from "../lib/logger.js";

export const triageDecisionSchema = z.object({
  source_message_id: z.string(),
  classification: z.enum(["BUG", "FEATURE_REQUEST", "IMPROVEMENT", "IRRELEVANT"]),
  action: z.enum(["CREATE_TASK", "LINK_TO_EXISTING", "DISMISS"]),
  existing_task_id: z.string().nullable(),
  new_task_group: z.string().nullable(),
  new_task_title: z.string().nullable(),
  new_task_description: z.string().nullable(),
  affected_repository_ids: z.array(z.string()).nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const triageResultSchema = z.object({
  decisions: z.array(triageDecisionSchema),
});

export type TriageResult = z.infer<typeof triageResultSchema>;
export type TriageDecision = z.infer<typeof triageDecisionSchema>;

const jsonSchema = zodToJsonSchema(triageResultSchema) as Record<string, unknown>;

interface TriageInput {
  messages: Array<{
    id: string;
    content: string;
    subject?: string | null;
    sender_name?: string | null;
    channel_kind: string;
    channel_name: string;
    source_repo?: string | null;
  }>;
  existingTasks: Array<{
    id: string;
    title: string;
    description: string;
    requester_count: number;
    status: string;
  }>;
  repositories: Array<{
    id: string;
    owner: string;
    name: string;
    analysis_summary?: string | null;
  }>;
  projectRules: string;
}

/**
 * Normalize LLM response that may use different field names.
 * Maps common variations back to the expected schema fields.
 */
function normalizeDecisions(raw: any, messageIds: string[]): any {
  if (!raw?.decisions || !Array.isArray(raw.decisions)) return raw;

  const normalized = raw.decisions.map((d: any, i: number) => ({
    // Map common field name variations
    source_message_id: d.source_message_id ?? d.message_id ?? d.messageId ?? messageIds[i],
    classification: d.classification ?? d.category ?? "IMPROVEMENT",
    action: d.action ?? d.decision ?? "CREATE_TASK",
    existing_task_id: d.existing_task_id ?? d.existingTaskId ?? null,
    new_task_group: d.new_task_group ?? d.newTaskGroup ?? d.task_group ?? d.group ?? null,
    new_task_title: d.new_task_title ?? d.newTaskTitle ?? d.task_title ?? d.title ?? null,
    new_task_description: d.new_task_description ?? d.newTaskDescription ?? d.task_description ?? d.description ?? null,
    affected_repository_ids: d.affected_repository_ids ?? d.affectedRepositoryIds ?? d.repository_ids ?? null,
    confidence: d.confidence ?? 0.5,
    reason: d.reason ?? d.explanation ?? "",
  }));

  return { decisions: normalized };
}

export async function runTriageAgent(
  provider: ILLMProvider,
  model: string,
  input: TriageInput,
): Promise<TriageResult> {
  const log = getLogger();
  const instructions = loadAgentInstructions("triage");

  const userContent = JSON.stringify(input);
  const messageIds = input.messages.map((m) => m.id);

  const completion = await provider.chat({
    model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userContent },
    ],
    jsonSchema,
    jsonSchemaStrict: true,
    temperature: 0.2,
    maxTokens: 8192,
  });

  try {
    const raw = JSON.parse(completion.content);
    const normalized = normalizeDecisions(raw, messageIds);
    return triageResultSchema.parse(normalized);
  } catch (err) {
    log.error({ err, content: completion.content }, "Failed to parse triage result");
    // Mark as error so they can be retried — never auto-dismiss
    throw new Error("Failed to parse triage LLM response");
  }
}
