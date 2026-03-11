import crypto from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SCOPE = "https://mail.google.com/";

interface GmailOAuthState {
  projectId: string;
  nonce: string;
}

// In-memory state store with TTL
const pendingStates = new Map<string, { state: GmailOAuthState; expiresAt: number }>();

export function buildGmailAuthorizationUrl(
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
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: encodedState,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function validateGmailState(encodedState: string): GmailOAuthState | null {
  const entry = pendingStates.get(encodedState);
  if (!entry || Date.now() > entry.expiresAt) {
    pendingStates.delete(encodedState);
    return null;
  }
  pendingStates.delete(encodedState);
  return entry.state;
}

export async function exchangeGmailCode(
  code: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(`Google OAuth error: ${data.error_description ?? data.error ?? "no access token"}`);
  }

  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token. Please revoke access and try again.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function refreshGmailAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? "no access token"}`);
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function getGmailUserEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json()) as { email?: string; error?: { message?: string } };

  if (!data.email) {
    throw new Error(`Could not retrieve email: ${data.error?.message ?? "unknown error"}`);
  }

  return data.email;
}
