"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getTask, updateTask, approveTask, dismissTask, getTaskMessages } from "@/lib/tasks";
import { startAgentPlanForTask } from "@/lib/plan-agent";
import type { Task, Plan, SourceMessage } from "@/lib/types";

const PLAN_BLOCKED_STATUSES = ["DONE", "WONTFIX"];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  EXECUTING: "bg-purple-100 text-purple-700",
  DONE: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  const [task, setTask] = useState<(Task & { links: unknown[]; impacts: unknown[]; plans: Plan[]; sourceMessages: unknown[] }) | null>(null);
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [userContext, setUserContext] = useState("");
  const [savingContext, setSavingContext] = useState(false);
  const [approvalInstructions, setApprovalInstructions] = useState("");
  const [messages, setMessages] = useState<SourceMessage[]>([]);
  const [showMessages, setShowMessages] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getTask(taskId).then((t) => {
      setTask(t);
      setStatus(t.status);
      setUserContext(t.user_context ?? "");
    });
    getTaskMessages(taskId).then(setMessages).catch(() => {});
  }, [taskId]);

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    const updated = await updateTask(taskId, { status: newStatus });
    setTask((prev) => (prev ? { ...prev, ...updated } : prev));
  }

  function handleUserContextChange(value: string) {
    setUserContext(value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSavingContext(true);
      await updateTask(taskId, { user_context: value });
      setSavingContext(false);
    }, 800);
  }

  async function handleApprove() {
    await approveTask(taskId, approvalInstructions || undefined);
    const t = await getTask(taskId);
    setTask(t);
    setStatus(t.status);
  }

  async function handleDismiss() {
    await dismissTask(taskId);
    const t = await getTask(taskId);
    setTask(t);
    setStatus(t.status);
  }

  async function handleGeneratePlan() {
    if (userContext !== (task?.user_context ?? "")) {
      await updateTask(taskId, { user_context: userContext });
    }
    setGenerating(true);
    try {
      const plan = await startAgentPlanForTask(taskId);
      router.push(`/plans/${plan.id}`);
    } catch {
      setGenerating(false);
    }
  }

  if (!task) return <div className="p-8 text-gray-500">Loading...</div>;

  const isPendingReview = task.status === "PENDING_REVIEW";
  const canGeneratePlan = !PLAN_BLOCKED_STATUSES.includes(status) && !isPendingReview;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/projects/${task.project_id}/tasks`} className="text-indigo-600 hover:underline">Tasks</Link>
        <span>/</span>
        <span className="text-gray-700">{task.title}</span>
      </div>
      <h1 className="mb-2 text-2xl font-bold">{task.title}</h1>

      <div className="mb-6 flex items-center gap-4">
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded border px-3 py-1 text-sm"
          disabled={isPendingReview}
        >
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="OPEN">Open</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="BLOCKED">Blocked</option>
          <option value="DONE">Done</option>
          <option value="WONTFIX">Won&apos;t Fix</option>
        </select>
        <span className="text-sm text-gray-400">Priority: {task.priority}</span>
        {task.requester_count > 1 && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            {task.requester_count} requests
          </span>
        )}
      </div>

      {/* Approval instructions (shown when set) */}
      {task.approval_instructions && (
        <div className="mb-6 rounded border border-green-200 bg-green-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-green-800">Approval Instructions</h2>
          <p className="whitespace-pre-wrap text-sm text-green-700">{task.approval_instructions}</p>
          {task.approved_at && (
            <p className="mt-1 text-xs text-green-600">Approved on {new Date(task.approved_at).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Pending review: approve/dismiss section */}
      {isPendingReview && (
        <div className="mb-6 rounded border border-orange-200 bg-orange-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-orange-800">This task is pending your review</h2>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-orange-700">Additional instructions (optional)</label>
            <textarea
              value={approvalInstructions}
              onChange={(e) => setApprovalInstructions(e.target.value)}
              placeholder="Add any specific instructions or context for the implementation..."
              rows={2}
              className="w-full rounded border border-orange-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleApprove} className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
              Approve Task
            </button>
            <button onClick={handleDismiss} className="rounded bg-gray-400 px-4 py-2 text-sm text-white hover:bg-gray-500">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 rounded border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">Description</h2>
        <p className="whitespace-pre-wrap text-sm">{task.description || "No description"}</p>
      </div>

      {/* Source messages section */}
      {messages.length > 0 && (
        <div className="mb-6 rounded border bg-white p-4">
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="flex w-full items-center justify-between text-sm font-semibold text-gray-600"
          >
            <span>Source Messages ({messages.length})</span>
            <span className="text-xs text-gray-400">{showMessages ? "Hide" : "Show"}</span>
          </button>
          {showMessages && (
            <div className="mt-3 space-y-2">
              {messages.map((msg) => (
                <div key={msg.id} className="rounded border bg-gray-50 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5">{msg.triage_classification ?? "UNCLASSIFIED"}</span>
                    {msg.sender_name && <span>{msg.sender_name}</span>}
                    {msg.sender_email && <span className="text-gray-400">&lt;{msg.sender_email}&gt;</span>}
                    <span className="ml-auto">{new Date(msg.received_at).toLocaleString()}</span>
                  </div>
                  {msg.subject && <p className="mb-1 text-sm font-medium">{msg.subject}</p>}
                  <p className="whitespace-pre-wrap text-sm text-gray-600 line-clamp-4">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User context for plan generation */}
      {!isPendingReview && (
        <div className="mb-6 rounded border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600">Additional context for plan generation</h2>
            {savingContext && <span className="text-xs text-gray-400">Saving...</span>}
          </div>
          <textarea
            value={userContext}
            onChange={(e) => handleUserContextChange(e.target.value)}
            placeholder="Add implementation hints, constraints, preferences, or any additional context for the plan agent..."
            rows={3}
            className="w-full rounded border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {!isPendingReview && (
        <div className="mb-6 flex gap-3">
          <button
            onClick={handleGeneratePlan}
            disabled={!canGeneratePlan || generating}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating Plan..." : "Generate Plan"}
          </button>
        </div>
      )}

      {/* Plans section */}
      <div className="mb-6 rounded border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">Plans</h2>
        {task.plans.length === 0 ? (
          <p className="text-sm text-gray-400">No plans generated yet</p>
        ) : (
          <div className="space-y-2">
            {task.plans.map((plan) => (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[plan.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {plan.status}
                  </span>
                  <span className="text-gray-600">Plan {plan.id.slice(0, 8)}</span>
                  {plan.agent_phase === "questioning" && (
                    <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                      Waiting for your answer
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(plan.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {task.links.length > 0 && (
        <div className="mb-6 rounded border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">Links</h2>
          <pre className="text-xs text-gray-600">{JSON.stringify(task.links, null, 2)}</pre>
        </div>
      )}

      {task.impacts.length > 0 && (
        <div className="rounded border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">Repository Impacts</h2>
          <pre className="text-xs text-gray-600">{JSON.stringify(task.impacts, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
