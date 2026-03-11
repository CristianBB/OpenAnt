import { apiFetch } from "./api";
import type { Task, Plan, WorkGroup, SourceMessage } from "./types";

export async function listTasks(projectId: string, opts?: { status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.q) params.set("q", opts.q);
  const query = params.toString();
  return apiFetch<Task[]>(`/api/projects/${projectId}/tasks${query ? `?${query}` : ""}`);
}

export async function getTask(taskId: string) {
  return apiFetch<Task & { links: unknown[]; impacts: unknown[]; plans: Plan[]; sourceMessages: unknown[] }>(`/api/tasks/${taskId}`);
}

export async function updateTask(taskId: string, data: { status?: string; title?: string; description?: string; user_context?: string }) {
  return apiFetch<Task>(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function approveTask(taskId: string, instructions?: string) {
  return apiFetch(`/api/tasks/${taskId}/approve`, {
    method: "POST",
    body: JSON.stringify({ instructions }),
  });
}

export async function dismissTask(taskId: string) {
  return apiFetch(`/api/tasks/${taskId}/dismiss`, { method: "POST" });
}

export async function getTaskMessages(taskId: string) {
  return apiFetch<SourceMessage[]>(`/api/tasks/${taskId}/messages`);
}

export async function listWorkGroups(projectId: string) {
  return apiFetch<WorkGroup[]>(`/api/projects/${projectId}/work-groups`);
}

export async function getWorkGroup(groupId: string) {
  return apiFetch<WorkGroup & { items: unknown[] }>(`/api/work-groups/${groupId}`);
}
