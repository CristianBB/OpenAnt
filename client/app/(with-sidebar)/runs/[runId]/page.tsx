"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getRun, streamRunLogs, type RunLogEntry, type Run } from "@/lib/runs";

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<Run | null>(null);
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [status, setStatus] = useState<string>("QUEUED");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getRun(runId).then((r) => {
      setRun(r);
      setStatus(r.status);
      if (r.logs) setLogs(r.logs);
    });
  }, [runId]);

  useEffect(() => {
    if (status === "DONE" || status === "FAILED") return;

    const cleanup = streamRunLogs(
      runId,
      (entry) => setLogs((prev) => [...prev, entry]),
      (finalStatus) => setStatus(finalStatus)
    );
    return cleanup;
  }, [runId, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const levelColor: Record<string, string> = {
    info: "text-blue-400",
    warn: "text-yellow-400",
    error: "text-red-400",
    debug: "text-gray-500",
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        {run && (
          <>
            <Link href={`/plans/${run.plan_id}`} className="text-indigo-600 hover:underline">Plan</Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-700">Run {runId.slice(0, 8)}</span>
      </div>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Run</h1>
        <span
          className={`rounded px-2 py-1 text-sm font-medium ${
            status === "DONE"
              ? "bg-green-100 text-green-800"
              : status === "FAILED"
                ? "bg-red-100 text-red-800"
                : status === "RUNNING"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-800"
          }`}
        >
          {status}
        </span>
      </div>

      {run && (
        <div className="mb-4 text-sm text-gray-500">
          <span>Plan: {run.plan_id.slice(0, 8)}</span>
          {run.started_at && <span className="ml-4">Started: {new Date(run.started_at).toLocaleString()}</span>}
          {run.ended_at && <span className="ml-4">Ended: {new Date(run.ended_at).toLocaleString()}</span>}
        </div>
      )}

      {run?.pullRequests && run.pullRequests.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">Pull Requests</h2>
          <div className="space-y-1">
            {run.pullRequests.map((pr) => (
              <div key={pr.id} className="flex items-center gap-2 text-sm">
                <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-800">#{pr.github_pr_number}</span>
                {pr.url && (
                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {pr.url}
                  </a>
                )}
                <span className="text-gray-500">{pr.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded border bg-gray-900 p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-400">Logs</h2>
        <div className="max-h-[600px] overflow-auto font-mono text-sm">
          {logs.length === 0 && (
            <div className="text-gray-500">Waiting for logs...</div>
          )}
          {logs.map((entry, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-gray-600">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 w-12 ${levelColor[entry.level] ?? "text-gray-400"}`}>
                [{entry.level}]
              </span>
              <span className="text-gray-200">{entry.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
