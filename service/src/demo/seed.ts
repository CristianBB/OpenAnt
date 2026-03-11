import { getRepos } from "../repos/sqlite/index.js";
import { createDemoRepo } from "./demo-repos.js";
import { getLogger } from "../lib/logger.js";

export async function seedDemoData(projectId: string): Promise<{ taskCount: number; repoCount: number }> {
  const log = getLogger();
  const repos = getRepos();

  // Create demo repos
  const demoRepoNames = ["demo-api", "demo-frontend"];
  const createdRepos: string[] = [];

  for (const name of demoRepoNames) {
    const repoPath = await createDemoRepo(name);
    const existing = repos.repositories.listByProject(projectId);
    if (!existing.some((r) => r.name === name)) {
      const repo = repos.repositories.create({
        project_id: projectId,
        owner: "demo",
        name,
        default_branch: "main",
      });
      repos.repositories.setSelected(repo.id, true);
      repos.repositories.updateAnalysis(
        repo.id,
        JSON.stringify({
          summary: `${name} is a demo TypeScript project for OpenAnt.`,
          projects: [{
            name,
            path: ".",
            description: "A simple TypeScript project with utility functions for demonstration purposes.",
            type: "Library",
            languages: ["TypeScript"],
            frameworks: ["Node.js"],
            features: ["String utilities (capitalize, slugify)", "Basic greeting function"],
          }],
          conventions: ["Functional style", "camelCase naming"],
          testCommands: ["npm test"],
          buildCommands: ["npm run build"],
          integrations: [],
        })
      );
      createdRepos.push(repo.id);
    }
  }

  // Create demo tasks
  const demoTasks = [
    {
      title: "Add input validation to API endpoints",
      description:
        "All POST/PUT endpoints in demo-api need request body validation using zod schemas. Currently there is no validation and invalid data can be persisted.",
      status: "OPEN" as const,
      priority: 1,
    },
    {
      title: "Implement rate limiting middleware",
      description:
        "Add a rate limiting middleware to prevent abuse. Should use a sliding window algorithm with configurable limits per route.",
      status: "OPEN" as const,
      priority: 2,
    },
    {
      title: "Add unit tests for utility functions",
      description:
        "The capitalize and slugify functions in demo-api/src/utils.ts have no tests. Add comprehensive unit tests using vitest.",
      status: "OPEN" as const,
      priority: 3,
    },
    {
      title: "Create error handling middleware",
      description:
        "Add a global error handler that catches unhandled errors, logs them, and returns appropriate HTTP responses.",
      status: "PLANNED" as const,
      priority: 2,
    },
    {
      title: "Set up CI/CD pipeline",
      description:
        "Create a GitHub Actions workflow that runs linting, type checking, and tests on every PR. Deploy to staging on merge to main.",
      status: "OPEN" as const,
      priority: 4,
    },
  ];

  let taskCount = 0;
  for (const task of demoTasks) {
    const existing = repos.tasks.listByProject(projectId, {});
    if (!existing.some((t) => t.title === task.title)) {
      repos.tasks.create({
        project_id: projectId,
        ...task,
      });
      taskCount++;
    }
  }

  // Create a demo work group
  const allTasks = repos.tasks.listByProject(projectId, {});
  const validationTasks = allTasks.filter(
    (t) =>
      t.title.includes("validation") || t.title.includes("error handling")
  );
  if (validationTasks.length >= 2) {
    const existingGroups = repos.workGroups.listByProject(projectId);
    if (!existingGroups.some((g) => g.name === "API Robustness")) {
      const group = repos.workGroups.create({
        project_id: projectId,
        name: "API Robustness",
        summary: "Tasks related to improving the API's robustness, including input validation and error handling.",
      });
      for (const task of validationTasks) {
        repos.workGroups.addItem(
          group.id,
          task.id,
          0.9,
          "Both relate to API robustness improvements"
        );
      }
    }
  }

  log.info({ projectId, taskCount, repoCount: createdRepos.length }, "Demo data seeded");
  return { taskCount, repoCount: createdRepos.length };
}
