import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { getRunLogs, onRunLog, onRunDone } from "../../runner/log-emitter.js";
import { getConfig } from "../../config/env.js";

export async function runRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { planId: string } }>("/api/plans/:planId/runs", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    return repos.runs.listByPlan(plan.id);
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId", async (request, reply) => {
    const repos = getRepos();
    const run = repos.runs.findById(request.params.runId);
    if (!run) {
      reply.code(404).send({ error: "Run not found" });
      return;
    }
    const logs = getRunLogs(run.id);
    const pullRequests = repos.pullRequests.listByPlan(run.plan_id);
    return { ...run, logs, pullRequests };
  });

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/stream", async (request, reply) => {
    const repos = getRepos();
    const run = repos.runs.findById(request.params.runId);
    if (!run) {
      reply.code(404).send({ error: "Run not found" });
      return;
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": getConfig().CLIENT_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
    });

    // Send existing logs first
    const existingLogs = getRunLogs(run.id);
    for (const log of existingLogs) {
      reply.raw.write(`data: ${JSON.stringify(log)}\n\n`);
    }

    // If run already ended, close the stream
    if (run.status === "DONE" || run.status === "FAILED") {
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
      reply.raw.end();
      return;
    }

    // Subscribe to live log events
    const offLog = onRunLog(run.id, (entry) => {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`);
    });

    const offDone = onRunDone(run.id, () => {
      const updatedRun = repos.runs.findById(run.id);
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ status: updatedRun?.status ?? "DONE" })}\n\n`);
      reply.raw.end();
    });

    // Clean up on disconnect
    request.raw.on("close", () => {
      offLog();
      offDone();
    });
  });
}
