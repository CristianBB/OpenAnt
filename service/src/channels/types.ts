import type { Channel } from "../types/entities.js";

export interface PollResult {
  messages: Array<{
    external_id: string;
    content: string;
    subject?: string;
    sender_name?: string;
    sender_email?: string;
    sender_id?: string;
    raw_json?: string;
    received_at?: string;
  }>;
  cursor?: string;
}

export interface ChannelHandler {
  poll(channel: Channel): Promise<PollResult>;
}
