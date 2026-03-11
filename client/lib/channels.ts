import { apiFetch } from "./api";
import type { Channel, SourceMessage } from "./types";

export async function listChannels(projectId: string) {
  return apiFetch<(Channel & { message_count: number; pending_count: number })[]>(
    `/api/projects/${projectId}/channels`
  );
}

export async function updateChannel(channelId: string, data: { name?: string; enabled?: boolean; config?: Record<string, unknown> }) {
  return apiFetch(`/api/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteChannel(channelId: string) {
  return apiFetch(`/api/channels/${channelId}`, { method: "DELETE" });
}

export async function listChannelMessages(channelId: string, opts?: { limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return apiFetch<SourceMessage[]>(`/api/channels/${channelId}/messages${qs ? `?${qs}` : ""}`);
}

export async function retryMessage(messageId: string) {
  return apiFetch<{ ok: boolean }>(`/api/messages/${messageId}/retry`, { method: "POST" });
}

export async function forceTriage(projectId: string) {
  return apiFetch<{ ok: boolean }>(`/api/projects/${projectId}/triage`, { method: "POST" });
}

export async function pollChannel(channelId: string) {
  return apiFetch<{ ok: boolean; newMessages: number }>(`/api/channels/${channelId}/poll`, { method: "POST" });
}

export async function getChannelConfig(channelId: string) {
  return apiFetch<{ id: string; kind: string; name: string; config: Record<string, unknown> }>(
    `/api/channels/${channelId}/config`
  );
}

export async function connectGmail(projectId: string, data: { email: string; appPassword: string }) {
  return apiFetch<{ channel: { id: string; name: string; kind: string } }>(
    `/api/projects/${projectId}/channels/gmail/connect`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function connectSlack(projectId: string, data: { botToken: string; appToken: string; name: string }) {
  return apiFetch<{ channel: { id: string; name: string; kind: string } }>(
    `/api/projects/${projectId}/channels/slack/connect`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function connectGitHubIssues(projectId: string, data: { repositoryIds: string[]; name: string }) {
  return apiFetch<{ channel: { id: string; name: string; kind: string } }>(
    `/api/projects/${projectId}/channels/github-issues/connect`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function connectGmailOAuth(projectId: string, data: { clientId: string; clientSecret: string }) {
  return apiFetch<{ url: string }>(
    `/api/projects/${projectId}/channels/gmail/oauth/connect`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function exchangeGmailOAuthCode(projectId: string, data: { code: string; clientId: string; clientSecret: string }) {
  return apiFetch<{ channel: { id: string; name: string; kind: string } }>(
    `/api/projects/${projectId}/channels/gmail/oauth/exchange`,
    { method: "POST", body: JSON.stringify(data) }
  );
}
