import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getRepos } from "../../repos/sqlite/index.js";
import { searchCode } from "../../semantic/code-search.js";
import { planAgentEmitter } from "./agent-loop.js";

interface AgentContext {
  planId: string;
  projectId: string;
  repositoryIds: string[];
}

export function createPlanAgentMcpServer(context: AgentContext) {
  const askQuestion = tool(
    "ask_question",
    "Ask the user a clarification question. The conversation will pause until the user answers. Use this when you need more information to create a good plan.",
    { question: z.string().describe("The question to ask the user"), context: z.string().optional().describe("Additional context about why you're asking") },
    async ({ question, context: questionContext }) => {
      const repos = getRepos();
      repos.planQuestions.create({
        plan_id: context.planId,
        question,
        context: questionContext,
      });
      repos.plans.update(context.planId, { agent_phase: "questioning" });
      repos.planConversations.append({
        plan_id: context.planId,
        role: "assistant",
        content: `**Question:** ${question}${questionContext ? `\n\n_Context: ${questionContext}_` : ""}`,
        metadata: JSON.stringify({ type: "question" }),
      });
      planAgentEmitter.emit(`plan:${context.planId}`, {
        type: "new_question",
        planId: context.planId,
        question: { question, context: questionContext },
      });
      return { content: [{ type: "text" as const, text: "Question submitted. Waiting for user answer..." }] };
    }
  );

  const submitPlan = tool(
    "submit_plan",
    "Submit the implementation plan for user review. Call this after you have analyzed the code and produced a complete plan.",
    { plan_markdown: z.string().describe("The complete implementation plan in markdown format") },
    async ({ plan_markdown }) => {
      const repos = getRepos();
      repos.plans.update(context.planId, {
        plan_markdown,
        status: "AWAITING_APPROVAL",
        agent_phase: "chatting",
      });
      repos.planConversations.append({
        plan_id: context.planId,
        role: "assistant",
        content: plan_markdown,
        metadata: JSON.stringify({ type: "plan" }),
      });
      planAgentEmitter.emit(`plan:${context.planId}`, {
        type: "plan_submitted",
        planId: context.planId,
      });
      return { content: [{ type: "text" as const, text: "Plan submitted for review. The user can now approve, request changes, or chat about the plan." }] };
    }
  );

  const searchIndexedCode = tool(
    "search_indexed_code",
    "Search across all indexed repository code for relevant files and code patterns. Use this to find files related to specific functionality, patterns, or keywords.",
    {
      query: z.string().describe("Search query (keywords, function names, patterns)"),
      file_glob: z.string().optional().describe("Optional glob pattern to filter files (e.g., '**/*.ts', 'src/api/**')"),
      limit: z.number().optional().describe("Max results to return (default: 20)"),
    },
    async ({ query, file_glob, limit }) => {
      const results = searchCode({
        repositoryIds: context.repositoryIds,
        query,
        fileGlob: file_glob,
        limit: limit ?? 20,
      });

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No matching files found." }] };
      }

      const formatted = results.map(r =>
        `### ${r.filePath} (${r.language ?? "unknown"}) — score: ${r.score.toFixed(2)}\n${r.snippet}`
      ).join("\n\n");

      return { content: [{ type: "text" as const, text: `Found ${results.length} matching files:\n\n${formatted}` }] };
    }
  );

  return createSdkMcpServer({
    name: "openant-plan-tools",
    tools: [askQuestion, submitPlan, searchIndexedCode],
  });
}
