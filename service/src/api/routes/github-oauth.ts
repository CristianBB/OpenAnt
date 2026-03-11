import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import {
  buildAuthorizationUrl,
  validateState,
  exchangeCode,
  storeOAuthToken,
} from "../../github/oauth.js";
import { GitHubClient } from "../../github/github-client.js";
import { getConfig } from "../../config/env.js";
import { z } from "zod";

const connectSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  callbackUrl: z.string().url().optional(),
});

export async function githubOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/integrations/github/connect",
    async (request, reply) => {
      const repos = getRepos();
      const project = repos.projects.findById(request.params.id);
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }

      const body = connectSchema.parse(request.body);
      const config = getConfig();
      const callbackUrl = body.callbackUrl ?? `http://localhost:${config.API_PORT}/api/github/oauth/callback`;
      const url = buildAuthorizationUrl(project.id, body.clientId, callbackUrl);

      return { url, clientId: body.clientId, clientSecret: body.clientSecret };
    }
  );

  app.get("/api/github/oauth/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      reply.code(400).send({ error: "Missing code or state" });
      return;
    }

    const oauthState = validateState(state);
    if (!oauthState) {
      reply.code(400).send({ error: "Invalid or expired state" });
      return;
    }

    // For the callback, we need the clientId/clientSecret.
    // They were stored when the connect was initiated.
    // We'll read them from a temporary store or re-derive from the connect request.
    // For simplicity, we encode them in the state or use a pending store.
    // In this implementation, the frontend should handle the redirect and pass the token exchange.
    const config = getConfig();
    reply.redirect(`${config.CLIENT_ORIGIN}/projects/${oauthState.projectId}/integrations?github_code=${code}&state=${state}`);
  });

  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/integrations/github/exchange",
    async (request, reply) => {
      const repos = getRepos();
      const project = repos.projects.findById(request.params.id);
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }

      const { code, clientId, clientSecret } = z
        .object({ code: z.string(), clientId: z.string(), clientSecret: z.string() })
        .parse(request.body);

      const { accessToken } = await exchangeCode(code, clientId, clientSecret);
      const ghClient = new GitHubClient(accessToken);
      const user = await ghClient.getAuthenticatedUser();

      storeOAuthToken(
        project.id,
        accessToken,
        user.login,
        clientId,
        clientSecret,
        `http://localhost:${getConfig().API_PORT}/api/github/oauth/callback`
      );

      return { connected: true, login: user.login };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/integrations/github/disconnect",
    async (request, reply) => {
      const repos = getRepos();
      const project = repos.projects.findById(request.params.id);
      if (!project) {
        reply.code(404).send({ error: "Project not found" });
        return;
      }

      repos.integrationSettings.delete(project.id, "GITHUB");
      return { ok: true };
    }
  );
}
