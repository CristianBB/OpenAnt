import type { ILLMProvider, ChatParams } from "./provider.js";
import type { ChatCompletion } from "./types.js";

export class MockLLMProvider implements ILLMProvider {
  async chat(params: ChatParams): Promise<ChatCompletion> {
    const systemPrompt = params.messages.find((m) => m.role === "system")?.content ?? "";

    if (systemPrompt.includes("task-assignment") || systemPrompt.includes("TaskAssignment")) {
      return {
        content: JSON.stringify({
          action: "no_change",
          links: [],
          impacts: [],
          reason: "Mock: No similar tasks found. Task appears unique.",
        }),
        finishReason: "stop",
      };
    }

    if (systemPrompt.includes("repo-analysis") || systemPrompt.includes("RepoAnalysis")) {
      return {
        content: JSON.stringify({
          conventions: ["TypeScript", "ESM modules", "Prettier formatting"],
          testCommands: ["npm test", "npm run typecheck"],
          buildCommands: ["npm run build"],
          modules: [
            { name: "src", description: "Source code directory" },
            { name: "tests", description: "Test files" },
          ],
        }),
        finishReason: "stop",
      };
    }

    if (systemPrompt.includes("plan-generation") || systemPrompt.includes("PlanGeneration")) {
      return {
        content: JSON.stringify({
          plan_markdown: "# Implementation Plan\n\n## Steps\n\n1. Create the feature module\n2. Add tests\n3. Update documentation\n\n## Estimated Changes\n\n- 3 files modified\n- 1 file created",
          plan_json: {
            steps: [
              { description: "Create feature module", files: ["src/feature.ts"], type: "create" },
              { description: "Add tests", files: ["tests/feature.test.ts"], type: "create" },
              { description: "Update docs", files: ["README.md"], type: "modify" },
            ],
          },
        }),
        finishReason: "stop",
      };
    }

    return {
      content: JSON.stringify({ result: "Mock response - no matching agent type detected" }),
      finishReason: "stop",
    };
  }
}
