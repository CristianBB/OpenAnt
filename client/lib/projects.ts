import { apiFetch } from "./api";

export interface Project {
  id: string;
  name: string;
  description: string;
  rules_nl: string;
  agent_policy_nl: string;
  max_parallel_runs: number;
  created_at: string;
  updated_at: string;
}

export async function listProjects() {
  return apiFetch<Project[]>("/api/projects");
}

export async function getProject(id: string) {
  return apiFetch<Project>(`/api/projects/${id}`);
}

export async function createProject(name: string, description?: string) {
  return apiFetch<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; rules_nl?: string; agent_policy_nl?: string; max_parallel_runs?: number }
) {
  return apiFetch<Project>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getIntegrationStatus(projectId: string) {
  return apiFetch<{ openrouter: boolean; github: boolean; anthropic: boolean }>(
    `/api/projects/${projectId}/integrations/status`
  );
}

export async function saveAnthropicConfig(
  projectId: string,
  data: { apiKey?: string; model?: string }
) {
  const payload: Record<string, string> = {};
  if (data.apiKey) payload.apiKey = data.apiKey;
  if (data.model) payload.model = data.model;

  return apiFetch(`/api/projects/${projectId}/integrations/anthropic`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAnthropicConfig(projectId: string) {
  return apiFetch<{
    configured: boolean;
    hasApiKey?: boolean;
    model?: string;
  }>(`/api/projects/${projectId}/integrations/anthropic`);
}

export async function saveOpenRouterConfig(
  projectId: string,
  data: { apiKey?: string; assignmentModel?: string; planningModel?: string }
) {
  // Only include apiKey if user provided a new one
  const payload: Record<string, string> = {};
  if (data.apiKey) payload.apiKey = data.apiKey;
  if (data.assignmentModel) payload.assignmentModel = data.assignmentModel;
  if (data.planningModel) payload.planningModel = data.planningModel;

  return apiFetch(`/api/projects/${projectId}/integrations/openrouter`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getOpenRouterConfig(projectId: string) {
  return apiFetch<{
    configured: boolean;
    hasApiKey?: boolean;
    assignmentModel?: string;
    planningModel?: string;
  }>(`/api/projects/${projectId}/integrations/openrouter`);
}

export async function connectGitHub(
  projectId: string,
  data: { clientId: string; clientSecret: string }
) {
  return apiFetch<{ url: string; clientId: string; clientSecret: string }>(
    `/api/projects/${projectId}/integrations/github/connect`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function exchangeGitHubCode(
  projectId: string,
  data: { code: string; clientId: string; clientSecret: string }
) {
  return apiFetch<{ connected: boolean; login: string }>(
    `/api/projects/${projectId}/integrations/github/exchange`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function disconnectGitHub(projectId: string) {
  return apiFetch(`/api/projects/${projectId}/integrations/github/disconnect`, {
    method: "POST",
  });
}

export async function getGitHubStatus(projectId: string) {
  return apiFetch<{ connected: boolean; login?: string }>(
    `/api/projects/${projectId}/integrations/github/status`
  );
}

export async function seedDemoData(projectId: string) {
  return apiFetch<{ taskCount: number; repoCount: number }>(
    `/api/projects/${projectId}/seed-demo`,
    { method: "POST" }
  );
}
