import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { runTaskAssignment } from "../../agents/task-assignment-runner.js";
import { autoGeneratePlanForTask } from "../../agents/plan-agent/auto-generate.js";
import { closeRelatedIssues } from "../../lib/close-related-issues.js";
import { z } from "zod";
import type { TaskStatus } from "../../types/enums.js";

const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  user_context: z.string().optional(),
  status: z.enum(["PENDING_REVIEW", "OPEN", "PLANNED", "IN_PROGRESS", "BLOCKED", "DONE", "WONTFIX"]).optional(),
  priority: z.number().optional(),
});

const approveTaskSchema = z.object({
  instructions: z.string().optional(),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { status?: string; q?: string } }>(
    "/api/projects/:id/tasks",
    async (request, reply) => {
      const repos = getRepos();
      const project = repos.projects.findById(request.params.id);
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }

      const filter: { status?: TaskStatus; q?: string } = {};
      if (request.query.status) filter.status = request.query.status as TaskStatus;
      if (request.query.q) filter.q = request.query.q;

      return repos.tasks.listByProject(project.id, filter);
    }
  );

  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const links = repos.taskLinks.listByTask(task.id);
    const impacts = repos.taskRepoImpacts.listByTask(task.id);
    const plans = repos.plans.listByTask(task.id);
    const sourceMessages = repos.taskSourceMessages.listByTask(task.id);
    return { ...task, links, impacts, plans, sourceMessages };
  });

  app.patch<{ Params: { taskId: string } }>("/api/tasks/:taskId", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const body = updateTaskSchema.parse(request.body);
    const updated = repos.tasks.update(task.id, body);

    // Close related GitHub issues when task is marked as DONE
    if (body.status === "DONE") {
      closeRelatedIssues(task.id).catch((err) => {
        app.log.error({ taskId: task.id, err }, "Failed to close related issues on task DONE");
      });
    }

    return updated;
  });

  // Approve a task (transitions from PENDING_REVIEW to OPEN, triggers plan generation)
  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/approve", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const project = repos.projects.findById(task.project_id);
    if (!project) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const body = approveTaskSchema.parse(request.body);

    repos.tasks.update(task.id, {
      status: "OPEN",
      approval_instructions: body.instructions ?? undefined,
      approved_at: new Date().toISOString(),
    });

    // Trigger plan generation in the background
    autoGeneratePlanForTask(task.id).catch((err) => {
      app.log.error({ err, taskId: task.id }, "Auto plan generation failed after approval");
    });

    return { ok: true };
  });

  // Dismiss a task (mark as WONTFIX and dismiss linked source messages)
  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/dismiss", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const project = repos.projects.findById(task.project_id);
    if (!project) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    repos.tasks.update(task.id, { status: "WONTFIX" });

    // Dismiss linked source messages
    const linked = repos.taskSourceMessages.listByTask(task.id);
    for (const link of linked) {
      repos.sourceMessages.markDismissed(link.source_message_id);
    }

    return { ok: true };
  });

  // Get source messages linked to a task
  app.get<{ Params: { taskId: string } }>("/api/tasks/:taskId/messages", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const links = repos.taskSourceMessages.listByTask(task.id);
    const messages = links.map((link) => repos.sourceMessages.findById(link.source_message_id)).filter(Boolean);
    return messages;
  });

  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/assign", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const project = repos.projects.findById(task.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    // Fire and forget — results are written to DB (impacts, links)
    runTaskAssignment(project.id, task.id).catch((err) => {
      app.log.error({ taskId: task.id, err }, "Background task assignment failed");
    });
    return { ok: true };
  });
}
