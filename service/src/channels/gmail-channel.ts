import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decrypt, encrypt, getOrCreateServerSecret } from "../lib/crypto.js";
import { getConfig } from "../config/env.js";
import { getRepos } from "../repos/sqlite/index.js";
import { refreshGmailAccessToken } from "./gmail-oauth.js";
import type { Channel } from "../types/entities.js";
import type { ChannelHandler, PollResult } from "./types.js";

interface GmailAppPasswordConfig {
  authType?: "appPassword";
  email: string;
  appPassword: string;
}

export interface GmailOAuthConfig {
  authType: "oauth";
  email: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tokenExpiry: string; // ISO 8601
}

type GmailConfig = GmailAppPasswordConfig | GmailOAuthConfig;

function isOAuthConfig(config: GmailConfig): config is GmailOAuthConfig {
  return config.authType === "oauth";
}

function decryptConfig(channel: Channel): GmailConfig {
  const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
  return JSON.parse(decrypt(channel.config_encrypted, secret));
}

function createImapClient(config: GmailConfig): ImapFlow {
  const auth = isOAuthConfig(config)
    ? { user: config.email, accessToken: config.accessToken }
    : { user: config.email, pass: config.appPassword };

  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth,
    logger: false,
  });
}

/**
 * Refresh the OAuth access token if it's expired or about to expire (within 5 minutes).
 * Updates the channel config in the database and returns the fresh config.
 */
async function ensureFreshToken(channel: Channel, config: GmailOAuthConfig): Promise<GmailOAuthConfig> {
  const expiresAt = new Date(config.tokenExpiry).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  if (Date.now() < expiresAt - fiveMinutes) {
    return config; // Token still valid
  }

  const { accessToken, expiresIn } = await refreshGmailAccessToken(
    config.refreshToken,
    config.clientId,
    config.clientSecret
  );

  const updatedConfig: GmailOAuthConfig = {
    ...config,
    accessToken,
    tokenExpiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };

  const secret = getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
  getRepos().channels.update(channel.id, {
    config_encrypted: encrypt(JSON.stringify(updatedConfig), secret),
  } as any);

  return updatedConfig;
}

export async function verifyGmailCredentials(email: string, appPassword: string): Promise<void> {
  const client = createImapClient({ email, appPassword });
  try {
    await client.connect();
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function verifyGmailOAuth(email: string, accessToken: string): Promise<void> {
  const client = createImapClient({ authType: "oauth", email, accessToken, refreshToken: "", clientId: "", clientSecret: "", tokenExpiry: "" });
  try {
    await client.connect();
  } finally {
    await client.logout().catch(() => {});
  }
}

export class GmailChannel implements ChannelHandler {
  async poll(channel: Channel): Promise<PollResult> {
    let config = decryptConfig(channel);

    // Refresh OAuth token if needed
    if (isOAuthConfig(config)) {
      config = await ensureFreshToken(channel, config);
    }

    const client = createImapClient(config);

    await client.connect();
    const messages: PollResult["messages"] = [];
    let highestUid = channel.last_poll_cursor ? Number(channel.last_poll_cursor) : 0;

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Search for unseen messages, optionally filtered by UID
      const searchCriteria: Record<string, unknown> = { seen: false };
      if (highestUid > 0) {
        searchCriteria.uid = `${highestUid + 1}:*`;
      }

      for await (const msg of client.fetch(searchCriteria, {
        uid: true,
        envelope: true,
        source: true,
      })) {
        // Skip if we already processed this UID (IMAP range can include the boundary)
        if (msg.uid <= highestUid) continue;
        if (!msg.source || !msg.envelope) continue;

        const parsed = await simpleParser(msg.source);

        const from = msg.envelope.from?.[0];
        const senderName = from?.name || from?.address || "";
        const senderEmail = from?.address || "";

        messages.push({
          external_id: String(msg.uid),
          content: parsed.text || parsed.textAsHtml || "",
          subject: msg.envelope.subject || "",
          sender_name: senderName,
          sender_email: senderEmail,
          raw_json: JSON.stringify(msg.envelope),
          received_at: msg.envelope.date?.toISOString(),
        });

        if (msg.uid > highestUid) {
          highestUid = msg.uid;
        }
      }
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }

    return {
      messages,
      cursor: highestUid > 0 ? String(highestUid) : undefined,
    };
  }
}
