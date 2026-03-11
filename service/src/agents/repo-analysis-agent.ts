import { zodToJsonSchema } from "zod-to-json-schema";
import { loadAgentInstructions } from "./load-instructions.js";
import { repoAnalysisSchema, type RepoAnalysis } from "./schemas.js";
import type { ILLMProvider } from "../llm/provider.js";
import { getLogger } from "../lib/logger.js";

interface RepoAnalysisInput {
  repoName: string;
  fileList: string[];
  keyFiles: Record<string, string>;
}

const jsonSchema = zodToJsonSchema(repoAnalysisSchema) as Record<string, unknown>;

export async function analyzeRepo(
  provider: ILLMProvider,
  model: string,
  input: RepoAnalysisInput
): Promise<RepoAnalysis> {
  const log = getLogger();
  const instructions = loadAgentInstructions("repo-analysis");

  const userContent = JSON.stringify({
    repoName: input.repoName,
    fileList: input.fileList.slice(0, 500),
    keyFiles: input.keyFiles,
  });

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
    const parsed = JSON.parse(completion.content);
    return repoAnalysisSchema.parse(parsed);
  } catch (err) {
    log.error({ err, content: completion.content }, "Failed to parse repo analysis");
    return {
      summary: "Analysis failed — could not parse LLM response",
      projects: [],
      conventions: [],
      testCommands: [],
      buildCommands: [],
      integrations: [],
      notes: null,
    };
  }
}
