import { getLogger } from "../../lib/logger.js";
import { getRepos } from "../../repos/sqlite/index.js";
import { indexTasks, indexRepository } from "../../semantic/indexer.js";

export async function runReindexQmd(): Promise<void> {
  const log = getLogger();
  const repos = getRepos();
  const projects = repos.projects.list();

  for (const project of projects) {
    try {
      await indexTasks(project.id);
      const projectRepos = repos.repositories.listSelectedByProject(project.id);
      for (const repo of projectRepos) {
        await indexRepository(project.id, repo.id);
      }
    } catch (err) {
      log.error({ projectId: project.id, err }, "Failed to reindex project");
    }
  }
  log.debug({ projectCount: projects.length }, "qmd reindex job completed");
}
