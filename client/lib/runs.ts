import { apiFetch, API_BASE } from "./api";

export interface RunLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: unknown;
}

export interface Run {
  id: string;
  plan_id: string;
  status: string;
  logs_path: string | null;
  workspace_path: string | null;
  branch_name: string | null;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
  logs?: RunLogEntry[];
  pullRequests?: Array<{
    id: string;
    github_pr_number: number | null;
    url: string | null;
    status: string;
  }>;
}

export async function listRunsByPlan(planId: string): Promise<Run[]> {
  return apiFetch<Run[]>(`/api/plans/${planId}/runs`);
}

export async function getRun(runId: string): Promise<Run> {
  return apiFetch<Run>(`/api/runs/${runId}`);
}

export function streamRunLogs(
  runId: string,
  onLog: (entry: RunLogEntry) => void,
  onDone: (status: string) => void
): () => void {
  const eventSource = new EventSource(
    `${API_BASE}/api/runs/${runId}/stream`,
    { withCredentials: true }
  );

  eventSource.onmessage = (event) => {
    try {
      const entry = JSON.parse(event.data) as RunLogEntry;
      onLog(entry);
    } catch {
      // skip invalid messages
    }
  };

  eventSource.addEventListener("done", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data);
      onDone(data.status);
    } catch {
      onDone("DONE");
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    eventSource.close();
    onDone("FAILED");
  };

  return () => eventSource.close();
}

export interface RepoDiff {
  repo: string;
  diff: string;
}

export async function getRunDiff(runId: string, contextLines?: number): Promise<RepoDiff[]> {
  const params = contextLines != null ? `?context=${contextLines}` : "";
  return apiFetch<RepoDiff[]>(`/api/runs/${runId}/diff${params}`);
}

export async function pushAndCreatePR(runId: string): Promise<{ prUrls: string[] }> {
  return apiFetch<{ prUrls: string[] }>(`/api/runs/${runId}/push`, {
    method: "POST",
  });
}
