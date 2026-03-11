import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { createProjectSchema, updateProjectSchema } from "../schemas/project-schemas.js";

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects", async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const repos = getRepos();
    const project = repos.projects.create(body);
    reply.code(201).send(project);
  });

  app.get("/api/projects", async (request) => {
    const repos = getRepos();
    return repos.projects.list();
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }
    return project;
  });

  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = updateProjectSchema.parse(request.body);
    const updated = repos.projects.update(request.params.id, body);
    return updated;
  });
}
