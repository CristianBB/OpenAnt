import { upsertDocument, initProjectIndex } from "./qmd-adapter.js";
import { getRepos } from "../repos/sqlite/index.js";
import { getLogger } from "../lib/logger.js";

export async function indexTasks(projectId: string): Promise<void> {
  const log = getLogger();
  const repos = getRepos();
  await initProjectIndex(projectId);

  const tasks = repos.tasks.listByProject(projectId);
  for (const task of tasks) {
    await upsertDocument(
      projectId,
      "tasks",
      `tasks/${task.id}`,
      task.title,
      `${task.title}\n\n${task.description}`
    );
  }
  log.info({ projectId, count: tasks.length }, "Indexed tasks");
}

export async function indexRepository(projectId: string, repoId: string): Promise<void> {
  const log = getLogger();
  const repos = getRepos();
  await initProjectIndex(projectId);

  const repo = repos.repositories.findById(repoId);
  if (!repo || !repo.analysis_json) {
    log.debug({ repoId }, "No analysis data to index");
    return;
  }

  await upsertDocument(
    projectId,
    "repos",
    `repos/${repo.id}`,
    `${repo.owner}/${repo.name}`,
    repo.analysis_json
  );
  log.info({ projectId, repoId: repo.id }, "Indexed repository");
}
