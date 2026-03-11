import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { seedDemoData } from "../../demo/seed.js";

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>("/api/projects/:id/seed-demo", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const result = await seedDemoData(project.id);
    return result;
  });
}
