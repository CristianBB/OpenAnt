import { getRepos } from "../../repos/sqlite/index.js";
import { getAnthropicConfig } from "../../llm/anthropic-config.js";
import { getLogger } from "../../lib/logger.js";
import { startPlanAgent } from "./agent-loop.js";
import { createPlanWorkspace } from "../../lib/workspace-manager.js";

/**
 * Auto-generate a plan for a task. Can be called from API routes or background jobs.
 * Returns the created plan, or null if prerequisites aren't met (no Anthropic config, etc.).
 */
export async function autoGeneratePlanForTask(taskId: string): Promise<{ planId: string } | null> {
  const log = getLogger();
  const repos = getRepos();

  const task = repos.tasks.findById(taskId);
  if (!task) {
    log.warn({ taskId }, "Auto-generate plan: task not found");
    return null;
  }

  const project = repos.projects.findById(task.project_id);
  if (!project) {
    log.warn({ taskId }, "Auto-generate plan: project not found");
    return null;
  }

  const anthropicConfig = getAnthropicConfig(project.id);
  if (!anthropicConfig) {
    log.debug({ taskId, projectId: project.id }, "Auto-generate plan: Anthropic not configured, skipping");
    return null;
  }

  // Create plan in DB first (need plan.id for workspace path)
  const plan = repos.plans.create({
    project_id: project.id,
    task_id: task.id,
    plan_markdown: "",
    plan_json: "{}",
    status: "DRAFT",
    agent_phase: "analyzing",
  });

  // Create workspace from local repo copies
  const selectedRepos = repos.repositories.listSelectedByProject(project.id);
  const { workspacePath, branchName } = await createPlanWorkspace({
    planId: plan.id,
    projectId: project.id,
    repos: selectedRepos,
  });
  repos.plans.update(plan.id, { workspace_path: workspacePath, branch_name: branchName });

  // Build prompt with optional user context
  const userContextBlock = task.user_context
    ? `\n\n**Additional context:**\n${task.user_context}`
    : "";

  // Save initial user message to conversation
  repos.planConversations.append({
    plan_id: plan.id,
    role: "user",
    content: `Generate an implementation plan for:\n\n**${task.title}**\n\n${task.description}${userContextBlock}`,
  });

  // Fire and forget - agent runs in background
  startPlanAgent({
    planId: plan.id,
    projectId: project.id,
    taskTitle: task.title,
    taskDescription: `${task.description}${userContextBlock}`,
    workspacePath,
  }).catch((err) => {
    log.error({ planId: plan.id, err }, "Auto-generate plan: agent failed");
  });

  log.info({ taskId, planId: plan.id }, "Auto-generated plan for new task");
  return { planId: plan.id };
}
