import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { getRepos } from "../repos/sqlite/index.js";
import { decryptSlackConfig, extractSlackMessage } from "./slack-channel.js";
import { getLogger } from "../lib/logger.js";

interface SlackConnection {
  socketClient: SocketModeClient;
  webClient: WebClient;
  channelId: string;
}

class SlackManager {
  private connections = new Map<string, SlackConnection>();

  async startAll(): Promise<void> {
    const log = getLogger();
    const repos = getRepos();
    const channels = repos.channels.listEnabledByKind("SLACK");

    for (const channel of channels) {
      try {
        await this.start(channel.id);
      } catch (err: any) {
        log.error({ channelId: channel.id, err: err.message }, "Failed to start Slack connection");
      }
    }
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map((id) => this.stop(id));
    await Promise.allSettled(promises);
  }

  async start(channelId: string): Promise<void> {
    if (this.connections.has(channelId)) return;

    const log = getLogger();
    const repos = getRepos();
    const channel = repos.channels.findById(channelId);
    if (!channel || channel.kind !== "SLACK") return;

    const config = decryptSlackConfig(channel);

    const socketClient = new SocketModeClient({ appToken: config.appToken });
    const webClient = new WebClient(config.botToken);

    socketClient.on("message", async ({ event, ack }) => {
      await ack();

      const payload = extractSlackMessage(event);
      if (!payload) return;

      try {
        // Resolve user name
        if (payload.userId) {
          try {
            const userInfo = await webClient.users.info({ user: payload.userId });
            payload.userName = userInfo.user?.real_name ?? userInfo.user?.name ?? "";
          } catch { /* ignore */ }
        }

        // Resolve channel name
        if (payload.channelId) {
          try {
            const channelInfo = await webClient.conversations.info({ channel: payload.channelId });
            payload.channelName = (channelInfo.channel as any)?.name ?? "";
          } catch { /* ignore */ }
        }

        const externalId = `${payload.channelId}:${payload.ts}`;
        const existing = repos.sourceMessages.findByChannelAndExternalId(channel.id, externalId);
        if (existing) return;

        repos.sourceMessages.create({
          channel_id: channel.id,
          project_id: channel.project_id,
          external_id: externalId,
          content: payload.text,
          subject: payload.channelName ? `#${payload.channelName}` : undefined,
          sender_name: payload.userName,
          sender_id: payload.userId,
          raw_json: JSON.stringify(event),
        });
      } catch (err: any) {
        log.error({ channelId, err: err.message }, "Failed to process Slack message");
      }
    });

    await socketClient.start();

    this.connections.set(channelId, {
      socketClient,
      webClient,
      channelId,
    });

    log.info({ channelId }, "Slack connection started");
  }

  async stop(channelId: string): Promise<void> {
    const conn = this.connections.get(channelId);
    if (!conn) return;

    try {
      await conn.socketClient.disconnect();
    } catch { /* ignore */ }

    this.connections.delete(channelId);
    getLogger().info({ channelId }, "Slack connection stopped");
  }
}

export const slackManager = new SlackManager();
