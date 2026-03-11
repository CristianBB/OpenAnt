import { getRepos } from "../../repos/sqlite/index.js";
import { getLogger } from "../../lib/logger.js";
import { processTriageBatch } from "../../agents/triage-runner.js";

export async function runTriage(): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  const projectIds = repos.sourceMessages.listProjectsWithPending();

  if (projectIds.length === 0) {
    log.debug("No projects with pending messages, skipping triage");
    return;
  }

  log.info({ projectCount: projectIds.length }, "Running triage for projects with pending messages");

  for (const projectId of projectIds) {
    try {
      await processTriageBatch(projectId);
    } catch (err: any) {
      log.error({ projectId, err: err.message }, "Triage failed for project");
    }
  }
}
