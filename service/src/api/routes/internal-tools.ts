import type { FastifyInstance } from "fastify";
import { internalAuthGuard } from "../middleware/internal-auth.js";
import { getRepos } from "../../repos/sqlite/index.js";
import { hybridSearch } from "../../semantic/qmd-adapter.js";

export async function internalToolRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", internalAuthGuard);

  app.post("/api/internal/tools/search-tasks", async (request) => {
    const { projectId, q, status } = request.body as { projectId: string; q?: string; status?: string };
    const repos = getRepos();
    return repos.tasks.listByProject(projectId, { q, status: status as any });
  });

  app.post("/api/internal/tools/get-task", async (request) => {
    const { taskId } = request.body as { taskId: string };
    return getRepos().tasks.findById(taskId);
  });

  app.post("/api/internal/tools/list-repos", async (request) => {
    const { projectId } = request.body as { projectId: string };
    return getRepos().repositories.listSelectedByProject(projectId);
  });

  app.post("/api/internal/tools/get-repo-analysis", async (request) => {
    const { repoId } = request.body as { repoId: string };
    const repo = getRepos().repositories.findById(repoId);
    if (!repo) return { error: "Not found" };
    return {
      analysis: repo.analysis_json ? JSON.parse(repo.analysis_json) : null,
    };
  });

  app.post("/api/internal/tools/semantic-search", async (request) => {
    const { projectId, query, collection, limit } = request.body as {
      projectId: string;
      query: string;
      collection?: string;
      limit?: number;
    };
    return hybridSearch(projectId, query, { collection, limit });
  });

  app.post("/api/internal/tools/create-plan", async (request) => {
    const data = request.body as {
      project_id: string;
      task_id?: string;
      work_group_id?: string;
      plan_markdown: string;
      plan_json: string;
    };
    return getRepos().plans.create({ ...data, status: "DRAFT" });
  });

  app.post("/api/internal/tools/update-plan", async (request) => {
    const { planId, plan_markdown, plan_json, status } = request.body as {
      planId: string;
      plan_markdown?: string;
      plan_json?: string;
      status?: string;
    };
    return getRepos().plans.update(planId, { plan_markdown, plan_json, status: status as any });
  });

  app.post("/api/internal/tools/set-plan-status", async (request) => {
    const { planId, status } = request.body as { planId: string; status: string };
    getRepos().plans.updateStatus(planId, status as any);
    return { ok: true };
  });
}
