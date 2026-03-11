import { apiFetch, API_BASE } from "./api";
import type { Plan, PlanConversation, PlanQuestion } from "./types";

export async function startAgentPlanForTask(taskId: string) {
  return apiFetch<Plan>(`/api/tasks/${taskId}/plans/agent`, { method: "POST" });
}

export async function startAgentPlanForGroup(groupId: string) {
  return apiFetch<Plan>(`/api/work-groups/${groupId}/plans/agent`, { method: "POST" });
}

export async function getConversation(planId: string) {
  return apiFetch<PlanConversation[]>(`/api/plans/${planId}/conversation`);
}

export async function sendChatMessage(planId: string, message: string) {
  return apiFetch<{ ok: boolean }>(`/api/plans/${planId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getQuestions(planId: string) {
  return apiFetch<PlanQuestion[]>(`/api/plans/${planId}/questions`);
}

export async function answerQuestion(planId: string, questionId: string, answer: string) {
  return apiFetch<{ ok: boolean }>(`/api/plans/${planId}/questions/${questionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

export async function startImplementation(planId: string) {
  return apiFetch<{ runId: string }>(`/api/plans/${planId}/implement`, { method: "POST" });
}

export interface PlanStreamEvent {
  type: string;
  planId?: string;
  plan?: Plan;
  message?: unknown;
  error?: string;
}

export async function getPlanPullRequests(planId: string) {
  return apiFetch<Array<{ id: string; github_pr_number: number | null; url: string | null; status: string }>>(`/api/plans/${planId}/pull-requests`);
}

export async function checkPlanMergeStatus(planId: string) {
  return apiFetch<{ allMerged: boolean; anyOpen: boolean; pullRequests: Array<{ id: string; status: string; url: string | null }> }>(`/api/plans/${planId}/check-merge`, { method: "POST" });
}

export function streamPlanEvents(
  planId: string,
  onEvent: (event: PlanStreamEvent) => void,
  onError?: (err: Event) => void,
): () => void {
  const eventSource = new EventSource(
    `${API_BASE}/api/plans/${planId}/stream`,
    { withCredentials: true }
  );

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as PlanStreamEvent;
      onEvent(parsed);
    } catch {
      // skip invalid messages
    }
  };

  eventSource.onerror = (err) => {
    onError?.(err);
    eventSource.close();
  };

  return () => eventSource.close();
}
