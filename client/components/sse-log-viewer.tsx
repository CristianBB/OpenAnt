"use client";

import { useEffect, useRef, useState } from "react";
import { streamRunLogs, type RunLogEntry } from "@/lib/runs";

const levelColor: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  debug: "text-gray-500",
};

export default function SSELogViewer({
  runId,
  initialLogs = [],
}: {
  runId: string;
  initialLogs?: RunLogEntry[];
}) {
  const [logs, setLogs] = useState<RunLogEntry[]>(initialLogs);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanup = streamRunLogs(
      runId,
      (entry) => setLogs((prev) => [...prev, entry]),
      () => setDone(true)
    );
    return cleanup;
  }, [runId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="rounded border bg-gray-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-400">Logs</span>
        {done ? (
          <span className="text-xs text-green-400">Complete</span>
        ) : (
          <span className="text-xs text-yellow-400">Streaming...</span>
        )}
      </div>
      <div className="max-h-[500px] overflow-auto font-mono text-sm">
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
  );
}
