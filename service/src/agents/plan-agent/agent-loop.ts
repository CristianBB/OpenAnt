import { query } from "@anthropic-ai/claude-agent-sdk";
import { createPlanAgentMcpServer } from "./custom-tools.js";
import { buildPlanningSystemPrompt, buildImplementationSystemPrompt } from "./system-prompt.js";
import { buildProjectRepoSummaries } from "../../semantic/repo-summary.js";
import { getRepos } from "../../repos/sqlite/index.js";
import { getAnthropicConfig } from "../../llm/anthropic-config.js";
import { getLogger } from "../../lib/logger.js";
import { EventEmitter } from "node:events";
import { execSync } from "node:child_process";

function buildAgentEnv(apiKey: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  env.ANTHROPIC_API_KEY = apiKey;
  // Unset CLAUDECODE to prevent "nested session" detection when the
  // service itself runs inside a Claude Code session.
  delete env.CLAUDECODE;
  return env;
}

function findClaudeExecutable(): string {
  try {
    const result = execSync("which claude", { encoding: "utf-8" }).trim();
    if (result) return result;
  } catch {
    // not in PATH
  }
  // Fallback: common macOS location
  const fallback = `${process.env.HOME}/Library/Application Support/com.conductor.app/bin/claude`;
  return fallback;
}

const claudeExecutablePath = findClaudeExecutable();

export const planAgentEmitter = new EventEmitter();
planAgentEmitter.setMaxListeners(200);

export async function startPlanAgent(params: {
  planId: string;
  projectId: string;
  taskTitle: string;
  taskDescription: string;
  workspacePath: string;
}): Promise<void> {
  const log = getLogger();
  const repos = getRepos();
  const anthropicConfig = getAnthropicConfig(params.projectId);
  if (!anthropicConfig) {
    throw new Error("Anthropic API key not configured");
  }

  const repoSummaries = buildProjectRepoSummaries(params.projectId);
  const selectedRepos = repos.repositories.listSelectedByProject(params.projectId);
  const repositoryIds = selectedRepos.map(r => r.id);

  const systemPrompt = buildPlanningSystemPrompt({
    repoSummaries,
  });

  const mcpServer = createPlanAgentMcpServer({
    planId: params.planId,
    projectId: params.projectId,
    repositoryIds,
  });

  const prompt = `Analyze this task and create an implementation plan:

**Title:** ${params.taskTitle}

**Description:**
${params.taskDescription}

Follow the mandatory workflow: inspect repos using the available tools, ask questions if needed, then submit a plan using submit_plan.`;

  repos.plans.update(params.planId, { agent_phase: "analyzing" });

  try {
    for await (const message of query({
      prompt,
      options: {
        pathToClaudeCodeExecutable: claudeExecutablePath,
        cwd: params.workspacePath,
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__openant__submit_plan",
          "mcp__openant__ask_question",
          "mcp__openant__search_indexed_code",
        ],
        systemPrompt,
        mcpServers: { openant: mcpServer },
        permissionMode: "acceptEdits",
        model: anthropicConfig.model,
        maxTurns: 50,
        env: buildAgentEnv(anthropicConfig.apiKey),
      },
    })) {
      // Emit for SSE streaming
      planAgentEmitter.emit(`plan:${params.planId}`, {
        type: "agent_message",
        planId: params.planId,
        message,
      });

      // Capture session ID for resumption
      if (message.type === "system" && message.subtype === "init") {
        repos.plans.update(params.planId, {
          agent_session_id: (message as any).session_id,
        });
      }

      // Save assistant text to conversation
      if ("result" in message && typeof message.result === "string") {
        repos.planConversations.append({
          plan_id: params.planId,
          role: "assistant",
          content: message.result,
        });
      }
    }

    // If agent finished without submitting a plan, mark as chatting
    const plan = repos.plans.findById(params.planId);
    if (plan && plan.agent_phase === "analyzing") {
      repos.plans.update(params.planId, { agent_phase: "chatting" });
    }

    planAgentEmitter.emit(`plan:${params.planId}`, {
      type: "agent_done",
      planId: params.planId,
    });
  } catch (err: any) {
    log.error({ planId: params.planId, err }, "Plan agent error");
    repos.plans.update(params.planId, {
      agent_phase: "error",
      agent_error: err.message,
    });
    planAgentEmitter.emit(`plan:${params.planId}`, {
      type: "agent_error",
      planId: params.planId,
      error: err.message,
    });
  }
}

export async function resumePlanAgent(planId: string, userMessage: string): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  const plan = repos.plans.findById(planId);
  if (!plan) throw new Error("Plan not found");

  const anthropicConfig = getAnthropicConfig(plan.project_id);
  if (!anthropicConfig) throw new Error("Anthropic API key not configured");

  // Save user message to conversation
  repos.planConversations.append({
    plan_id: planId,
    role: "user",
    content: userMessage,
  });

  repos.plans.update(planId, { agent_phase: "chatting" });

  const runFreshSession = async () => {
    const conversation = repos.planConversations.listByPlan(planId);
    const conversationContext = conversation
      .map(m => `**${m.role}:** ${m.content}`)
      .join("\n\n---\n\n");

    const repoSummaries = buildProjectRepoSummaries(plan.project_id);
    const systemPrompt = buildPlanningSystemPrompt({ repoSummaries });
    const selectedRepos = repos.repositories.listSelectedByProject(plan.project_id);

    const mcpServer = createPlanAgentMcpServer({
      planId,
      projectId: plan.project_id,
      repositoryIds: selectedRepos.map(r => r.id),
    });

    for await (const message of query({
      prompt: `Previous conversation:\n\n${conversationContext}\n\n---\n\nUser's new message: ${userMessage}`,
      options: {
        pathToClaudeCodeExecutable: claudeExecutablePath,
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__openant__submit_plan",
          "mcp__openant__ask_question",
          "mcp__openant__search_indexed_code",
        ],
        systemPrompt,
        mcpServers: { openant: mcpServer },
        permissionMode: "acceptEdits",
        model: anthropicConfig.model,
        maxTurns: 30,
        env: buildAgentEnv(anthropicConfig.apiKey),
      },
    })) {
      planAgentEmitter.emit(`plan:${planId}`, {
        type: "agent_message",
        planId,
        message,
      });

      if (message.type === "system" && message.subtype === "init") {
        repos.plans.update(planId, {
          agent_session_id: (message as any).session_id,
        });
      }

      if ("result" in message && typeof message.result === "string") {
        repos.planConversations.append({
          plan_id: planId,
          role: "assistant",
          content: message.result,
        });
      }
    }
  };

  try {
    if (plan.agent_session_id) {
      try {
        // Try resuming existing session
        for await (const message of query({
          prompt: userMessage,
          options: {
            pathToClaudeCodeExecutable: claudeExecutablePath,
            resume: plan.agent_session_id,
            env: buildAgentEnv(anthropicConfig.apiKey),
          },
        })) {
          planAgentEmitter.emit(`plan:${planId}`, {
            type: "agent_message",
            planId,
            message,
          });

          if ("result" in message && typeof message.result === "string") {
            repos.planConversations.append({
              plan_id: planId,
              role: "assistant",
              content: message.result,
            });
          }
        }
      } catch (resumeErr: any) {
        log.warn({ planId, err: resumeErr.message }, "Session resume failed, starting fresh");
        repos.plans.update(planId, { agent_session_id: null as any });
        await runFreshSession();
      }
    } else {
      await runFreshSession();
    }

    planAgentEmitter.emit(`plan:${planId}`, {
      type: "agent_done",
      planId,
    });
  } catch (err: any) {
    log.error({ planId, err }, "Resume plan agent error");
    repos.plans.update(planId, {
      agent_phase: "error",
      agent_error: err.message,
    });
    planAgentEmitter.emit(`plan:${planId}`, {
      type: "agent_error",
      planId,
      error: err.message,
    });
  }
}

export async function startImplementationAgent(params: {
  planId: string;
  planMarkdown: string;
  workspacePath: string;
  projectId: string;
  repoDirectories?: string[];
}): Promise<void> {
  const log = getLogger();
  const repos = getRepos();
  const anthropicConfig = getAnthropicConfig(params.projectId);
  if (!anthropicConfig) throw new Error("Anthropic API key not configured");

  const systemPrompt = buildImplementationSystemPrompt();

  const repoList = params.repoDirectories?.length
    ? `\n\nThe repositories are in the following subdirectories of your workspace:\n${params.repoDirectories.map(d => `- ./${d}/`).join("\n")}\n\nIMPORTANT: All file changes MUST be inside these repository directories. Do NOT modify files outside of them.`
    : "";

  const prompt = `The following implementation plan has been approved. Implement it now.
${repoList}

## Plan

${params.planMarkdown}

Make all the necessary code changes following the plan exactly. Work only within the repository directories listed above.`;

  repos.plans.update(params.planId, { agent_phase: "implementing" });

  try {
    for await (const message of query({
      prompt,
      options: {
        pathToClaudeCodeExecutable: claudeExecutablePath,
        cwd: params.workspacePath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        systemPrompt,
        model: anthropicConfig.model,
        maxTurns: 100,
        env: buildAgentEnv(anthropicConfig.apiKey),
      },
    })) {
      planAgentEmitter.emit(`plan:${params.planId}`, {
        type: "implementation_message",
        planId: params.planId,
        message,
      });

      if ("result" in message && typeof message.result === "string") {
        repos.planConversations.append({
          plan_id: params.planId,
          role: "assistant",
          content: message.result,
          metadata: JSON.stringify({ type: "implementation" }),
        });
      }
    }

    repos.plans.update(params.planId, { agent_phase: "review" });

    planAgentEmitter.emit(`plan:${params.planId}`, {
      type: "implementation_done",
      planId: params.planId,
    });
  } catch (err: any) {
    log.error({ planId: params.planId, err }, "Implementation agent error");
    repos.plans.update(params.planId, {
      agent_phase: "error",
      agent_error: err.message,
    });
    planAgentEmitter.emit(`plan:${params.planId}`, {
      type: "agent_error",
      planId: params.planId,
      error: err.message,
    });
    throw err;
  }
}

export async function resumeImplementationAgent(planId: string, userMessage: string, workspacePath: string): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  const plan = repos.plans.findById(planId);
  if (!plan) throw new Error("Plan not found");

  const anthropicConfig = getAnthropicConfig(plan.project_id);
  if (!anthropicConfig) throw new Error("Anthropic API key not configured");

  repos.planConversations.append({
    plan_id: planId,
    role: "user",
    content: userMessage,
  });

  repos.plans.update(planId, { agent_phase: "implementing" });

  const systemPrompt = buildImplementationSystemPrompt();
  const conversation = repos.planConversations.listByPlan(planId);
  const conversationContext = conversation
    .map(m => `**${m.role}:** ${m.content}`)
    .join("\n\n---\n\n");

  try {
    for await (const message of query({
      prompt: `Previous conversation:\n\n${conversationContext}\n\n---\n\nUser's new request: ${userMessage}\n\nMake the requested changes to the code in the workspace.`,
      options: {
        pathToClaudeCodeExecutable: claudeExecutablePath,
        cwd: workspacePath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        systemPrompt,
        model: anthropicConfig.model,
        maxTurns: 50,
        env: buildAgentEnv(anthropicConfig.apiKey),
      },
    })) {
      planAgentEmitter.emit(`plan:${planId}`, {
        type: "implementation_message",
        planId,
        message,
      });

      if ("result" in message && typeof message.result === "string") {
        repos.planConversations.append({
          plan_id: planId,
          role: "assistant",
          content: message.result,
          metadata: JSON.stringify({ type: "implementation" }),
        });
      }
    }

    repos.plans.update(planId, { agent_phase: "review" });

    planAgentEmitter.emit(`plan:${planId}`, {
      type: "implementation_done",
      planId,
    });
  } catch (err: any) {
    log.error({ planId, err }, "Resume implementation agent error");
    repos.plans.update(planId, {
      agent_phase: "error",
      agent_error: err.message,
    });
    planAgentEmitter.emit(`plan:${planId}`, {
      type: "agent_error",
      planId,
      error: err.message,
    });
  }
}
