import { assignTask } from "./task-assignment-agent.js";
import type { TaskAssignmentResult } from "./schemas.js";
import { getLLMProvider } from "../llm/index.js";
import { getRepos } from "../repos/sqlite/index.js";
import { getLogger } from "../lib/logger.js";

export async function runTaskAssignment(
  projectId: string,
  taskId: string
): Promise<TaskAssignmentResult> {
  const log = getLogger();
  const repos = getRepos();

  const task = repos.tasks.findById(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const project = repos.projects.findById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Gather context
  const selectedRepos = repos.repositories.listSelectedByProject(projectId);
  const repoSummaries = selectedRepos.map((r) => ({
    id: r.id,
    name: `${r.owner}/${r.name}`,
    analysis: r.analysis_json ? JSON.parse(r.analysis_json) : null,
  }));

  const allTasks = repos.tasks.listByProject(projectId, {});
  const candidateTasks = allTasks
    .filter((t) => t.id !== taskId && ["OPEN", "PLANNED", "IN_PROGRESS"].includes(t.status))
    .slice(0, 50)
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
    }));

  const workGroups = repos.workGroups
    .listByProject(projectId)
    .filter((g) => g.status === "OPEN")
    .map((g) => ({
      id: g.id,
      name: g.name,
      summary: g.summary,
      status: g.status,
    }));

  const { provider, config } = getLLMProvider(projectId);

  log.info({ projectId, taskId, repos: repoSummaries.length, candidates: candidateTasks.length }, "Running task assignment");

  const result = await assignTask(provider, config.assignmentModel, {
    newTask: { id: task.id, title: task.title, description: task.description },
    candidateTasks,
    workGroups,
    projectRules: project.rules_nl,
    repoSummaries,
  });

  log.info({ taskId, action: result.action, reason: result.reason }, "Task assignment result");

  // Apply results
  if (result.action === "attach_to_group" && result.targetGroupId) {
    const group = repos.workGroups.findById(result.targetGroupId);
    if (group) {
      repos.workGroups.addItem(group.id, taskId, 1.0, result.reason ?? "Assigned by LLM");
    }
  }

  if (result.action === "create_group" && result.newGroup) {
    const group = repos.workGroups.create({
      project_id: projectId,
      name: result.newGroup.name,
      summary: result.newGroup.summary,
    });
    repos.workGroups.addItem(group.id, taskId, 1.0, result.reason ?? "Created by LLM");
  }

  for (const link of result.links) {
    repos.taskLinks.create({
      project_id: projectId,
      from_task_id: link.fromTaskId,
      to_task_id: link.toTaskId,
      type: link.type,
      confidence: link.confidence,
      reason: link.reason,
    });
  }

  for (const impact of result.impacts) {
    repos.taskRepoImpacts.create({
      task_id: taskId,
      repository_id: impact.repositoryId,
      areas_json: JSON.stringify(impact.areas),
      confidence: impact.confidence,
      reason: impact.reason,
    });
  }

  return result;
}
