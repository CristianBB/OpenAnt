import type { Channel } from "../types/entities.js";
import { decrypt, getOrCreateServerSecret } from "../lib/crypto.js";
import { getConfig } from "../config/env.js";

export interface SlackChannelConfig {
  botToken: string;
  appToken: string;
}

export interface SlackMessagePayload {
  text: string;
  userId: string;
  userName: string;
  channelId: string;
  channelName: string;
  threadTs?: string;
  ts: string;
}

export function decryptSlackConfig(channel: Channel): SlackChannelConfig {
  const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
  return JSON.parse(decrypt(channel.config_encrypted, secret));
}

/**
 * Extracts a normalized SlackMessagePayload from a raw Slack event.
 * Used by SlackManager when processing incoming socket-mode events.
 */
export function extractSlackMessage(event: any): SlackMessagePayload | null {
  // Ignore bot messages
  if (event.bot_id || event.subtype === "bot_message") {
    return null;
  }

  // Handle message_changed events
  if (event.subtype === "message_changed" && event.message) {
    return {
      text: event.message.text ?? "",
      userId: event.message.user ?? "",
      userName: "",
      channelId: event.channel ?? "",
      channelName: "",
      threadTs: event.message.thread_ts,
      ts: event.message.ts ?? event.event_ts ?? "",
    };
  }

  // Standard message event
  if (event.type === "message" && !event.subtype) {
    return {
      text: event.text ?? "",
      userId: event.user ?? "",
      userName: "",
      channelId: event.channel ?? "",
      channelName: "",
      threadTs: event.thread_ts,
      ts: event.ts ?? "",
    };
  }

  return null;
}
