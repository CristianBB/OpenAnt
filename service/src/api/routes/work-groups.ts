import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";

export async function workGroupRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/projects/:id/work-groups", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    return repos.workGroups.listByProject(project.id);
  });

  app.get<{ Params: { groupId: string } }>("/api/work-groups/:groupId", async (request, reply) => {
    const repos = getRepos();
    const group = repos.workGroups.findById(request.params.groupId);
    if (!group) {
      reply.code(404).send({ error: "Work group not found" });
      return;
    }

    const items = repos.workGroups.listItems(group.id);
    const tasks = items.map((item) => {
      const task = repos.tasks.findById(item.task_id);
      return { ...item, task };
    });

    return { ...group, items: tasks };
  });
}
