"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { listTasks, approveTask, dismissTask } from "@/lib/tasks";
import type { Task } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "bg-orange-100 text-orange-800",
  OPEN: "bg-blue-100 text-blue-800",
  PLANNED: "bg-purple-100 text-purple-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  BLOCKED: "bg-red-100 text-red-800",
  DONE: "bg-green-100 text-green-800",
  WONTFIX: "bg-gray-100 text-gray-800",
};

export default function TasksPage() {
  const params = useParams();
  const id = params.id as string;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [id, statusFilter]);

  async function loadTasks() {
    setLoading(true);
    try {
      const data = await listTasks(id, {
        status: statusFilter || undefined,
        q: search || undefined,
      });
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(e: React.MouseEvent, taskId: string) {
    e.preventDefault();
    e.stopPropagation();
    await approveTask(taskId);
    await loadTasks();
  }

  async function handleDismiss(e: React.MouseEvent, taskId: string) {
    e.preventDefault();
    e.stopPropagation();
    await dismissTask(taskId);
    await loadTasks();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Tasks</h1>

      <div className="mb-4 flex gap-2">
        <input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadTasks()}
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="OPEN">Open</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="BLOCKED">Blocked</option>
          <option value="DONE">Done</option>
          <option value="WONTFIX">Won&apos;t Fix</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="text-gray-500">No tasks found.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              className="block rounded border bg-white p-4 hover:border-blue-300"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ""}`}>
                  {t.status === "PENDING_REVIEW" ? "Pending Review" : t.status}
                </span>
                <span className="font-medium">{t.title}</span>
                {t.requester_count > 1 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t.requester_count} requests
                  </span>
                )}
                {t.status === "PENDING_REVIEW" && (
                  <span className="ml-auto flex gap-1">
                    <button
                      onClick={(e) => handleApprove(e, t.id)}
                      className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={(e) => handleDismiss(e, t.id)}
                      className="rounded bg-gray-400 px-2 py-1 text-xs text-white hover:bg-gray-500"
                    >
                      Dismiss
                    </button>
                  </span>
                )}
              </div>
              {t.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{t.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
