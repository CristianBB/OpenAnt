import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { encrypt, decrypt, getOrCreateServerSecret } from "../../lib/crypto.js";
import { getConfig } from "../../config/env.js";
import { slackManager } from "../../channels/slack-manager.js";
import { verifyGmailCredentials, verifyGmailOAuth } from "../../channels/gmail-channel.js";
import {
  buildGmailAuthorizationUrl,
  validateGmailState,
  exchangeGmailCode,
  getGmailUserEmail,
} from "../../channels/gmail-oauth.js";
import { z } from "zod";

function getSecret(): Buffer {
  return getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
}

const createChannelSchema = z.object({
  kind: z.enum(["GMAIL", "SLACK", "GITHUB_ISSUES"]),
  name: z.string().min(1),
  config: z.record(z.unknown()),
});

const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  // List channels for a project
  app.get<{ Params: { id: string } }>("/api/projects/:id/channels", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const channels = repos.channels.listByProject(project.id);
    return channels.map((ch) => ({
      id: ch.id,
      project_id: ch.project_id,
      kind: ch.kind,
      name: ch.name,
      enabled: !!ch.enabled,
      last_poll_at: ch.last_poll_at,
      created_at: ch.created_at,
      updated_at: ch.updated_at,
      message_count: repos.sourceMessages.countByChannel(ch.id),
      pending_count: repos.sourceMessages.countPendingByChannel(ch.id),
    }));
  });

  // Update a channel
  app.patch<{ Params: { channelId: string } }>("/api/channels/:channelId", async (request, reply) => {
    const repos = getRepos();
    const channel = repos.channels.findById(request.params.channelId);
    if (!channel) {
      reply.code(404).send({ error: "Channel not found" });
      return;
    }

    const project = repos.projects.findById(channel.project_id);
    if (!project) {
      reply.code(404).send({ error: "Channel not found" });
      return;
    }

    const body = updateChannelSchema.parse(request.body);
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.enabled !== undefined) {
      updateData.enabled = body.enabled ? 1 : 0;
      // Start/stop Slack connections dynamically
      if (channel.kind === "SLACK") {
        if (body.enabled) {
          await slackManager.start(channel.id);
        } else {
          await slackManager.stop(channel.id);
        }
      }
    }
    if (body.config) {
      updateData.config_encrypted = encrypt(JSON.stringify(body.config), getSecret());
    }

    repos.channels.update(channel.id, updateData as any);
    return { ok: true };
  });

  // Delete a channel
  app.delete<{ Params: { channelId: string } }>("/api/channels/:channelId", async (request, reply) => {
    const repos = getRepos();
    const channel = repos.channels.findById(request.params.channelId);
    if (!channel) {
      reply.code(404).send({ error: "Channel not found" });
      return;
    }

    const project = repos.projects.findById(channel.project_id);
    if (!project) {
      reply.code(404).send({ error: "Channel not found" });
      return;
    }

    if (channel.kind === "SLACK") {
      await slackManager.stop(channel.id);
    }

    repos.channels.delete(channel.id);
    return { ok: true };
  });

  // Get channel config (decrypted)
  app.get<{ Params: { channelId: string } }>("/api/channels/:channelId/config", async (request, reply) => {
    const repos = getRepos();
    const channel = repos.channels.findById(request.params.channelId);
    if (!channel) {
      reply.code(404).send({ error: "Channel not found" });
      return;
    }

    const config = JSON.parse(decrypt(channel.config_encrypted, getSecret()));
    return {
      id: channel.id,
      kind: channel.kind,
      name: channel.name,
      config,
    };
  });

  // List source messages for a channel
  app.get<{ Params: { channelId: string }; Querystring: { limit?: string; offset?: string } }>(
    "/api/channels/:channelId/messages",
    async (request, reply) => {
      const repos = getRepos();
      const channel = repos.channels.findById(request.params.channelId);
      if (!channel) {
        reply.code(404).send({ error: "Channel not found" });
        return;
      }

      const project = repos.projects.findById(channel.project_id);
      if (!project) {
        reply.code(404).send({ error: "Channel not found" });
        return;
      }

      const limit = parseInt(request.query.limit ?? "50", 10);
      const offset = parseInt(request.query.offset ?? "0", 10);
      return repos.sourceMessages.listByChannel(channel.id, { limit, offset });
    }
  );

  // Reset a source message to PENDING so it gets re-triaged
  app.post<{ Params: { messageId: string } }>(
    "/api/messages/:messageId/retry",
    async (request, reply) => {
      const repos = getRepos();
      const msg = repos.sourceMessages.findById(request.params.messageId);
      if (!msg) {
        reply.code(404).send({ error: "Message not found" });
        return;
      }
      repos.sourceMessages.markPending(msg.id);
      return { ok: true };
    }
  );

  // Force triage now for a project
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/triage",
    async (request, reply) => {
      const { processTriageBatch } = await import("../../agents/triage-runner.js");
      await processTriageBatch(request.params.id);
      return { ok: true };
    }
  );

  // Gmail: connect with email + app password (IMAP)
  app.post<{ Params: { id: string } }>("/api/projects/:id/channels/gmail/connect", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = z.object({
      email: z.string().email(),
      appPassword: z.string().min(1),
    }).parse(request.body);

    // Verify credentials by attempting IMAP connection
    try {
      await verifyGmailCredentials(body.email, body.appPassword);
    } catch {
      reply.code(400).send({ error: "Could not connect to Gmail. Check your email and app password." });
      return;
    }

    const channelConfig = { email: body.email, appPassword: body.appPassword };
    const channel = repos.channels.create({
      project_id: project.id,
      kind: "GMAIL",
      name: body.email,
      config_encrypted: encrypt(JSON.stringify(channelConfig), getSecret()),
    });

    return { channel: { id: channel.id, name: channel.name, kind: channel.kind } };
  });

  // Slack: connect with tokens
  app.post<{ Params: { id: string } }>("/api/projects/:id/channels/slack/connect", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = z.object({
      botToken: z.string().min(1),
      appToken: z.string().min(1),
      name: z.string().min(1),
    }).parse(request.body);

    const channelConfig = {
      botToken: body.botToken,
      appToken: body.appToken,
    };

    const channel = repos.channels.create({
      project_id: project.id,
      kind: "SLACK",
      name: body.name,
      config_encrypted: encrypt(JSON.stringify(channelConfig), getSecret()),
    });

    // Start the WebSocket connection
    await slackManager.start(channel.id);

    return { channel: { id: channel.id, name: channel.name, kind: channel.kind } };
  });

  // GitHub Issues: select repos to watch
  app.post<{ Params: { id: string } }>("/api/projects/:id/channels/github-issues/connect", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = z.object({
      repositoryIds: z.array(z.string()).min(1),
      name: z.string().min(1),
    }).parse(request.body);

    const channelConfig = {
      repositoryIds: body.repositoryIds,
    };

    const channel = repos.channels.create({
      project_id: project.id,
      kind: "GITHUB_ISSUES",
      name: body.name,
      config_encrypted: encrypt(JSON.stringify(channelConfig), getSecret()),
    });

    return { channel: { id: channel.id, name: channel.name, kind: channel.kind } };
  });

  // Gmail OAuth: initiate OAuth flow
  app.post<{ Params: { id: string } }>("/api/projects/:id/channels/gmail/oauth/connect", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    }).parse(request.body);

    const config = getConfig();
    const callbackUrl = `http://localhost:${config.API_PORT}/api/gmail/oauth/callback`;
    const url = buildGmailAuthorizationUrl(project.id, body.clientId, callbackUrl);

    return { url };
  });

  // Gmail OAuth: callback from Google
  app.get("/api/gmail/oauth/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code || !state) {
      reply.code(400).send({ error: "Missing code or state" });
      return;
    }

    const oauthState = validateGmailState(state);
    if (!oauthState) {
      reply.code(400).send({ error: "Invalid or expired state" });
      return;
    }

    const config = getConfig();
    reply.redirect(`${config.CLIENT_ORIGIN}/projects/${oauthState.projectId}/channels?gmail_code=${code}`);
  });

  // Gmail OAuth: exchange code for tokens and create channel
  app.post<{ Params: { id: string } }>("/api/projects/:id/channels/gmail/oauth/exchange", async (request, reply) => {
    const repos = getRepos();
    const project = repos.projects.findById(request.params.id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const body = z.object({
      code: z.string().min(1),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    }).parse(request.body);

    const config = getConfig();
    const callbackUrl = `http://localhost:${config.API_PORT}/api/gmail/oauth/callback`;

    const { accessToken, refreshToken, expiresIn } = await exchangeGmailCode(
      body.code,
      body.clientId,
      body.clientSecret,
      callbackUrl
    );

    const email = await getGmailUserEmail(accessToken);

    // Verify IMAP connectivity with OAuth token
    try {
      await verifyGmailOAuth(email, accessToken);
    } catch {
      reply.code(400).send({ error: "OAuth succeeded but could not connect to Gmail IMAP. Ensure the Gmail API is enabled." });
      return;
    }

    const channelConfig = {
      authType: "oauth" as const,
      email,
      accessToken,
      refreshToken,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      tokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };

    const channel = repos.channels.create({
      project_id: project.id,
      kind: "GMAIL",
      name: email,
      config_encrypted: encrypt(JSON.stringify(channelConfig), getSecret()),
    });

    return { channel: { id: channel.id, name: channel.name, kind: channel.kind } };
  });
}
