import { getRepos } from "../../repos/sqlite/index.js";
import { getLogger } from "../../lib/logger.js";
import { GmailChannel } from "../../channels/gmail-channel.js";
import { GitHubIssuesChannel } from "../../channels/github-issues-channel.js";
import type { ChannelHandler } from "../../channels/types.js";
import type { Channel } from "../../types/entities.js";
import type { ChannelKind } from "../../types/enums.js";

const handlers: Record<string, ChannelHandler> = {
  GMAIL: new GmailChannel(),
  GITHUB_ISSUES: new GitHubIssuesChannel(),
};

export async function pollSingleChannel(channel: Channel): Promise<{ newMessages: number }> {
  const log = getLogger();
  const repos = getRepos();

  const handler = handlers[channel.kind];
  if (!handler) {
    throw new Error(`No poll handler for channel kind: ${channel.kind}`);
  }

  const result = await handler.poll(channel);

  let newMessages = 0;

  // Create source messages, skipping duplicates
  for (const msg of result.messages) {
    const existing = repos.sourceMessages.findByChannelAndExternalId(channel.id, msg.external_id);
    if (existing) continue;

    repos.sourceMessages.create({
      channel_id: channel.id,
      project_id: channel.project_id,
      external_id: msg.external_id,
      content: msg.content,
      subject: msg.subject,
      sender_name: msg.sender_name,
      sender_email: msg.sender_email,
      sender_id: msg.sender_id,
      raw_json: msg.raw_json,
      received_at: msg.received_at,
    });

    newMessages++;
  }

  // Update poll cursor
  if (result.cursor) {
    repos.channels.updatePollCursor(channel.id, result.cursor, new Date().toISOString());
  }

  log.info({ channelId: channel.id, kind: channel.kind, newMessages }, "Channel polled");

  return { newMessages };
}

export async function runPollChannels(): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  // Only poll GMAIL and GITHUB_ISSUES; SLACK uses WebSocket
  const pollableKinds: ChannelKind[] = ["GMAIL", "GITHUB_ISSUES"];

  for (const kind of pollableKinds) {
    const channels = repos.channels.listEnabledByKind(kind);

    for (const channel of channels) {
      try {
        await pollSingleChannel(channel);
      } catch (err: any) {
        log.error({ channelId: channel.id, kind, err: err.message }, "Failed to poll channel");
      }
    }
  }
}
