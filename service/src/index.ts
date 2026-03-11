import Fastify from "fastify";
import cors from "@fastify/cors";
import { getConfig } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { getDb, closeDb } from "./db/database.js";
import { projectRoutes } from "./api/routes/projects.js";
import { integrationRoutes } from "./api/routes/integrations.js";
import { githubOAuthRoutes } from "./api/routes/github-oauth.js";
import { repositoryRoutes } from "./api/routes/repositories.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { workGroupRoutes } from "./api/routes/work-groups.js";
import { startScheduler, stopScheduler } from "./scheduler/interval.js";
import { planRoutes } from "./api/routes/plans.js";
import { internalToolRoutes } from "./api/routes/internal-tools.js";
import { internalRepoToolRoutes } from "./api/routes/internal-repo-tools.js";
import { runRoutes } from "./api/routes/runs.js";
import { demoRoutes } from "./api/routes/demo.js";
import { planAgentRoutes } from "./api/routes/plan-agent.js";
import { channelRoutes } from "./api/routes/channels.js";
import { slackManager } from "./channels/slack-manager.js";

async function main() {
  const config = getConfig();
  const isDev = config.NODE_ENV === "development";

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(isDev
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : {}),
    },
  });

  app.log.info(`Data directory: ${config.OPENANT_DATA_DIR}`);
  runMigrations();

  // Reset in-flight statuses from previous process (fire-and-forget tasks don't survive restarts)
  const db = getDb();
  db.prepare("UPDATE repositories SET analysis_status = 'IDLE' WHERE analysis_status = 'ANALYZING'").run();
  db.prepare("UPDATE plans SET status = 'FAILED', agent_error = 'Server restarted during generation' WHERE status = 'GENERATING'").run();

  await app.register(cors, {
    origin: [config.CLIENT_ORIGIN],
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });
  await app.register(projectRoutes);
  await app.register(integrationRoutes);
  await app.register(githubOAuthRoutes);
  await app.register(repositoryRoutes);
  await app.register(taskRoutes);
  await app.register(workGroupRoutes);
  await app.register(planRoutes);
  await app.register(internalToolRoutes);
  await app.register(internalRepoToolRoutes);
  await app.register(runRoutes);
  await app.register(demoRoutes);
  await app.register(planAgentRoutes);
  await app.register(channelRoutes);

  startScheduler();

  // Start Slack WebSocket connections for all enabled channels
  await slackManager.startAll().catch((err) => {
    app.log.error({ err }, "Failed to start Slack connections");
  });

  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });

  const shutdown = async () => {
    app.log.info("Shutting down...");
    stopScheduler();
    await slackManager.stopAll();
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start service:", err);
  process.exit(1);
});
