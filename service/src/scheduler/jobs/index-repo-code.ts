import { getLogger } from "../../lib/logger.js";
import { getRepos } from "../../repos/sqlite/index.js";
import { indexRepositoryCode } from "../../semantic/code-indexer.js";

export async function runIndexRepoCode(): Promise<void> {
  const log = getLogger();
  const repos = getRepos();
  const projects = repos.projects.list();

  for (const project of projects) {
    try {
      const selectedRepos = repos.repositories.listSelectedByProject(project.id);
      for (const repo of selectedRepos) {
        try {
          await indexRepositoryCode(repo.id);
        } catch (err) {
          log.error({ projectId: project.id, repoId: repo.id, err }, "Failed to index repo code");
        }
      }
    } catch (err) {
      log.error({ projectId: project.id, err }, "Failed to process project for code indexing");
    }
  }
  log.debug({ projectCount: projects.length }, "Code indexing job completed");
}
