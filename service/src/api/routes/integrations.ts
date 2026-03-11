import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { openrouterConfigSchema, anthropicConfigSchema } from "../schemas/integration-schemas.js";
import { encrypt, decrypt, getOrCreateServerSecret } from "../../lib/crypto.js";
import { getConfig } from "../../config/env.js";

function getSecret(): Buffer {
  return getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.patch<{ Params: { id: string } }>("/api/projects/:id/integrations/openrouter", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = openrouterConfigSchema.parse(request.body);

    // Merge with existing config to preserve apiKey when not provided
    let finalConfig = { ...body };
    const existing = repos.integrationSettings.findByProjectAndKind(project.id, "OPENROUTER");
    if (existing) {
      try {
        const oldConfig = JSON.parse(decrypt(existing.json_encrypted, getSecret()));
        if (!body.apiKey) finalConfig.apiKey = oldConfig.apiKey;
        if (!body.assignmentModel) finalConfig.assignmentModel = oldConfig.assignmentModel;
        if (!body.planningModel) finalConfig.planningModel = oldConfig.planningModel;
      } catch { /* first save or corrupt — require apiKey */ }
    }

    if (!finalConfig.apiKey) {
      reply.code(400).send({ error: "API key is required" });
      return;
    }

    const encrypted = encrypt(JSON.stringify(finalConfig), getSecret());
    repos.integrationSettings.upsert(project.id, "OPENROUTER", encrypted);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/integrations/openrouter", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const setting = repos.integrationSettings.findByProjectAndKind(project.id, "OPENROUTER");
    if (!setting) return { configured: false };

    try {
      const data = JSON.parse(decrypt(setting.json_encrypted, getSecret()));
      return {
        configured: true,
        hasApiKey: !!data.apiKey,
        assignmentModel: data.assignmentModel ?? "",
        planningModel: data.planningModel ?? "",
      };
    } catch {
      return { configured: false };
    }
  });

  app.patch<{ Params: { id: string } }>("/api/projects/:id/integrations/anthropic", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = anthropicConfigSchema.parse(request.body);

    let finalConfig = { ...body };
    const existing = repos.integrationSettings.findByProjectAndKind(project.id, "ANTHROPIC");
    if (existing) {
      try {
        const oldConfig = JSON.parse(decrypt(existing.json_encrypted, getSecret()));
        if (!body.apiKey) finalConfig.apiKey = oldConfig.apiKey;
        if (!body.model) finalConfig.model = oldConfig.model;
      } catch { /* first save */ }
    }

    if (!finalConfig.apiKey) {
      reply.code(400).send({ error: "API key is required" });
      return;
    }

    const encrypted = encrypt(JSON.stringify(finalConfig), getSecret());
    repos.integrationSettings.upsert(project.id, "ANTHROPIC", encrypted);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/integrations/anthropic", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const setting = repos.integrationSettings.findByProjectAndKind(project.id, "ANTHROPIC");
    if (!setting) return { configured: false };

    try {
      const data = JSON.parse(decrypt(setting.json_encrypted, getSecret()));
      return {
        configured: true,
        hasApiKey: !!data.apiKey,
        model: data.model ?? "",
      };
    } catch {
      return { configured: false };
    }
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/integrations/status", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const settings = repos.integrationSettings.listByProject(project.id);
    const status: Record<string, boolean> = {
      openrouter: false,
      github: false,
      anthropic: false,
    };

    for (const s of settings) {
      status[s.kind.toLowerCase()] = true;
    }

    return status;
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/integrations/github/status", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const ghSetting = repos.integrationSettings.findByProjectAndKind(project.id, "GITHUB");
    if (!ghSetting) {
      return { connected: false };
    }

    try {
      const config = JSON.parse(decrypt(ghSetting.json_encrypted, getSecret()));
      return { connected: true, login: config.login ?? null };
    } catch {
      return { connected: false };
    }
  });
}
