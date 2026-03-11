import { apiFetch } from "./api";
import type { Plan, Run } from "./types";

export async function listPlans(projectId: string) {
  return apiFetch<Plan[]>(`/api/projects/${projectId}/plans`);
}

export async function getPlan(planId: string) {
  return apiFetch<Plan>(`/api/plans/${planId}`);
}

export async function generatePlanForTask(taskId: string) {
  return apiFetch<Plan>(`/api/tasks/${taskId}/plans`, { method: "POST" });
}

export async function generatePlanForGroup(groupId: string) {
  return apiFetch<Plan>(`/api/work-groups/${groupId}/plans`, { method: "POST" });
}

export async function submitPlanForReview(planId: string) {
  return apiFetch<Plan>(`/api/plans/${planId}/submit`, { method: "POST" });
}

export async function approvePlan(planId: string) {
  return apiFetch(`/api/plans/${planId}/approve`, { method: "POST" });
}

export async function retryPlan(planId: string) {
  return apiFetch<Plan>(`/api/plans/${planId}/retry`, { method: "POST" });
}

export async function rejectPlan(planId: string) {
  return apiFetch(`/api/plans/${planId}/reject`, { method: "POST" });
}

export async function requestPlanChanges(planId: string, feedback: string) {
  return apiFetch<Plan>(`/api/plans/${planId}/request-changes`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

export async function executePlan(planId: string) {
  return apiFetch<{ runId: string }>(`/api/plans/${planId}/execute`, { method: "POST" });
}

export async function listRuns(planId: string) {
  return apiFetch<Run[]>(`/api/plans/${planId}/runs`);
}
