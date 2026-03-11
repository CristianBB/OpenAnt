import crypto from "node:crypto";
import { getRepos } from "../repos/sqlite/index.js";
import { encrypt, decrypt, getOrCreateServerSecret } from "../lib/crypto.js";
import { getConfig } from "../config/env.js";

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

interface OAuthState {
  projectId: string;
  nonce: string;
}

// In-memory state store with TTL
const pendingStates = new Map<string, { state: OAuthState; expiresAt: number }>();

function getSecret(): Buffer {
  return getOrCreateServerSecret(getConfig().OPENANT_DATA_DIR);
}

export function getGitHubConfig(projectId: string): { clientId: string; clientSecret: string; callbackUrl: string } | null {
  const repos = getRepos();
  const setting = repos.integrationSettings.findByProjectAndKind(projectId, "GITHUB");
  if (!setting) return null;
  try {
    const config = JSON.parse(decrypt(setting.json_encrypted, getSecret()));
    return config;
  } catch {
    return null;
  }
}

export function buildAuthorizationUrl(
  projectId: string,
  clientId: string,
  callbackUrl: string
): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = JSON.stringify({ projectId, nonce });
  const encodedState = Buffer.from(state).toString("base64url");

  pendingStates.set(encodedState, {
    state: { projectId, nonce },
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "repo read:user user:email read:org",
    state: encodedState,
  });

  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

export function validateState(encodedState: string): OAuthState | null {
  const entry = pendingStates.get(encodedState);
  if (!entry || Date.now() > entry.expiresAt) {
    pendingStates.delete(encodedState);
    return null;
  }
  pendingStates.delete(encodedState);
  return entry.state;
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; tokenType: string }> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const data = (await res.json()) as { access_token?: string; token_type?: string; error?: string };
  if (data.error || !data.access_token) {
    throw new Error(`GitHub OAuth error: ${data.error ?? "no access token"}`);
  }

  return { accessToken: data.access_token, tokenType: data.token_type ?? "bearer" };
}

export function storeOAuthToken(
  projectId: string,
  accessToken: string,
  login: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string
): void {
  const repos = getRepos();
  const data = JSON.stringify({ accessToken, login, clientId, clientSecret, callbackUrl });
  const encrypted = encrypt(data, getSecret());
  repos.integrationSettings.upsert(projectId, "GITHUB", encrypted);
}

export function getOAuthToken(projectId: string): string | null {
  const repos = getRepos();
  const setting = repos.integrationSettings.findByProjectAndKind(projectId, "GITHUB");
  if (!setting) return null;
  try {
    const data = JSON.parse(decrypt(setting.json_encrypted, getSecret()));
    return data.accessToken ?? null;
  } catch {
    return null;
  }
}
