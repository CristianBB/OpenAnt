import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { getLLMProvider } from "../../llm/index.js";
import { generatePlan } from "../../agents/plan-generation-agent.js";
import { executeRun } from "../../runner/run-executor.js";
import { cleanupPlan, deletePlanWorkspace } from "../../lib/workspace-manager.js";

export async function planRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/plans", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    if (task.status === "DONE" || task.status === "WONTFIX") {
      reply.code(400).send({ error: "Cannot generate a plan for a task with status " + task.status });
      return;
    }

    const project = repos.projects.findById(task.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    // Create plan row immediately with GENERATING status
    const plan = repos.plans.create({
      project_id: project.id,
      task_id: task.id,
      plan_markdown: "",
      plan_json: "{}",
      status: "GENERATING",
    });

    // Fire and forget — LLM call runs in background
    const { provider, config } = getLLMProvider(project.id);
    const selectedRepos = repos.repositories.listSelectedByProject(project.id);
    const repoAnalyses = selectedRepos.map((r) => ({
      repoName: `${r.owner}/${r.name}`,
      analysis: r.analysis_json ? JSON.parse(r.analysis_json) : null,
    }));

    generatePlan(provider, config.planningModel, {
      task: { id: task.id, title: task.title, description: task.description },
      repoAnalyses,
      projectRules: project.rules_nl,
      agentPolicy: project.agent_policy_nl,
    }).then((result) => {
      repos.plans.update(plan.id, {
        plan_markdown: result.plan_markdown,
        plan_json: JSON.stringify(result.plan_json),
      });
      repos.plans.updateStatus(plan.id, "AWAITING_APPROVAL");
    }).catch((err) => {
      app.log.error({ planId: plan.id, err }, "Background plan generation failed");
      repos.plans.updateStatus(plan.id, "FAILED");
      repos.plans.update(plan.id, { agent_error: err.message ?? "Unknown error" });
    });

    reply.code(202).send(plan);
  });

  app.post<{ Params: { groupId: string } }>("/api/work-groups/:groupId/plans", async (request, reply) => {
    const repos = getRepos();
    const group = repos.workGroups.findById(request.params.groupId);
    if (!group) {
      reply.code(404).send({ error: "Work group not found" });
      return;
    }

    const project = repos.projects.findById(group.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    // Create plan row immediately with GENERATING status
    const plan = repos.plans.create({
      project_id: project.id,
      work_group_id: group.id,
      plan_markdown: "",
      plan_json: "{}",
      status: "GENERATING",
    });

    // Fire and forget — LLM call runs in background
    const { provider, config } = getLLMProvider(project.id);
    const items = repos.workGroups.listItems(group.id);
    const tasks = items.map((item) => repos.tasks.findById(item.task_id)).filter(Boolean);
    const selectedRepos = repos.repositories.listSelectedByProject(project.id);
    const repoAnalyses = selectedRepos.map((r) => ({
      repoName: `${r.owner}/${r.name}`,
      analysis: r.analysis_json ? JSON.parse(r.analysis_json) : null,
    }));

    generatePlan(provider, config.planningModel, {
      workGroup: {
        id: group.id,
        name: group.name,
        summary: group.summary,
        tasks: tasks.map((t) => ({ title: t!.title, description: t!.description })),
      },
      repoAnalyses,
      projectRules: project.rules_nl,
      agentPolicy: project.agent_policy_nl,
    }).then((result) => {
      repos.plans.update(plan.id, {
        plan_markdown: result.plan_markdown,
        plan_json: JSON.stringify(result.plan_json),
      });
      repos.plans.updateStatus(plan.id, "AWAITING_APPROVAL");
    }).catch((err) => {
      app.log.error({ planId: plan.id, err }, "Background plan generation failed");
      repos.plans.updateStatus(plan.id, "FAILED");
      repos.plans.update(plan.id, { agent_error: err.message ?? "Unknown error" });
    });

    reply.code(202).send(plan);
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/plans", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }
    return repos.plans.listByProject(project.id);
  });

  app.get<{ Params: { planId: string } }>("/api/plans/:planId", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    return plan;
  });

  app.post<{ Params: { planId: string } }>("/api/plans/:planId/submit", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    if (plan.status !== "DRAFT") {
      reply.code(400).send({ error: "Only DRAFT plans can be submitted for review" });
      return;
    }
    repos.plans.updateStatus(plan.id, "AWAITING_APPROVAL");
    repos.plans.update(plan.id, { agent_phase: "chatting" });
    return repos.plans.findById(plan.id);
  });

  app.post<{ Params: { planId: string } }>("/api/plans/:planId/approve", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    repos.plans.updateStatus(plan.id, "APPROVED");
    return { ok: true };
  });

  app.post<{ Params: { planId: string } }>("/api/plans/:planId/retry", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    if (plan.status !== "FAILED") {
      reply.code(400).send({ error: "Only FAILED plans can be retried" });
      return;
    }
    repos.plans.updateStatus(plan.id, "APPROVED");
    repos.plans.update(plan.id, { agent_phase: "chatting", agent_error: null as any });
    return repos.plans.findById(plan.id);
  });

  // Request changes: sends feedback to the plan agent and resets to DRAFT
  app.post<{ Params: { planId: string } }>("/api/plans/:planId/request-changes", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    if (plan.status !== "AWAITING_APPROVAL") {
      reply.code(400).send({ error: "Only plans awaiting approval can receive change requests" });
      return;
    }

    const body = request.body as { feedback?: string };
    const feedback = body?.feedback ?? "";
    if (!feedback.trim()) {
      reply.code(400).send({ error: "Feedback is required" });
      return;
    }

    // Add feedback as a user message to the conversation
    repos.planConversations.append({
      plan_id: plan.id,
      role: "user",
      content: feedback,
      metadata: JSON.stringify({ type: "change_request" }),
    });

    // Reset plan to DRAFT so the agent can revise it
    repos.plans.updateStatus(plan.id, "DRAFT");
    repos.plans.update(plan.id, { agent_phase: "chatting" });

    return repos.plans.findById(plan.id);
  });

  app.post<{ Params: { planId: string } }>("/api/plans/:planId/reject", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    repos.plans.updateStatus(plan.id, "REJECTED");

    // Clean up workspace and remote branches in background
    if (plan.workspace_path || plan.branch_name) {
      const selectedRepos = repos.repositories.listSelectedByProject(plan.project_id);
      cleanupPlan({
        planId: plan.id,
        projectId: plan.project_id,
        branchName: plan.branch_name,
        repos: selectedRepos,
      }).catch((err) => {
        app.log.warn({ planId: plan.id, err: err.message }, "Failed to clean up rejected plan");
      });
      repos.plans.update(plan.id, { workspace_path: null as any, branch_name: null as any });
    }

    return { ok: true };
  });

  app.post<{ Params: { planId: string } }>("/api/plans/:planId/archive", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    if (plan.status !== "DONE" && plan.status !== "REJECTED" && plan.status !== "FAILED") {
      reply.code(400).send({ error: "Only DONE, REJECTED, or FAILED plans can be archived" });
      return;
    }
    repos.plans.updateStatus(plan.id, "ARCHIVED");

    // Delete local workspace only (keep remote branches for merged PRs)
    if (plan.workspace_path) {
      deletePlanWorkspace(plan.id);
      repos.plans.update(plan.id, { workspace_path: null as any });
    }

    return { ok: true };
  });

  app.post<{ Params: { planId: string } }>("/api/plans/:planId/execute", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    if (plan.status !== "APPROVED") {
      reply.code(400).send({ error: "Plan must be approved before execution" });
      return;
    }

    repos.plans.updateStatus(plan.id, "EXECUTING");
    const run = repos.runs.create({ plan_id: plan.id });

    // Fire and forget - execution runs in background
    executeRun(run.id).catch((err) => {
      app.log.error({ runId: run.id, err }, "Run execution failed");
    });

    return { runId: run.id };
  });
}
