"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getPlan, approvePlan, rejectPlan, executePlan } from "@/lib/plans";
import { PlanChat } from "@/components/plan-chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Plan } from "@/lib/types";

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPlan(planId).then(setPlan);
  }, [planId]);

  const handlePlanUpdate = useCallback((updated: Plan) => {
    setPlan(updated);
  }, []);

  async function handleApprove() {
    setLoading(true);
    await approvePlan(planId);
    setPlan((p) => (p ? { ...p, status: "APPROVED" } : p));
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    await rejectPlan(planId);
    setPlan((p) => (p ? { ...p, status: "REJECTED" } : p));
    setLoading(false);
  }

  async function handleExecute() {
    setLoading(true);
    const { runId } = await executePlan(planId);
    router.push(`/runs/${runId}`);
  }

  if (!plan) return <div className="p-8 text-gray-500">Loading...</div>;

  // If plan has an active agent phase, show the chat interface
  const isAgentPlan = plan.agent_phase && plan.agent_phase !== "idle";

  if (isAgentPlan) {
    return <PlanChat plan={plan} onPlanUpdate={handlePlanUpdate} />;
  }

  // Fallback: static plan viewer for old-style plans
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/projects/${plan.project_id}/plans`} className="text-indigo-600 hover:underline">Plans</Link>
        <span>/</span>
        <span className="text-gray-700">Plan {planId.slice(0, 8)}</span>
        {plan.task_id && (
          <>
            <span className="ml-2">·</span>
            <Link href={`/tasks/${plan.task_id}`} className="ml-2 text-gray-500 hover:underline">View task</Link>
          </>
        )}
      </div>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Plan</h1>
        <span className="rounded bg-gray-100 px-2 py-1 text-sm">{plan.status}</span>
      </div>

      <div className="mb-6 flex gap-2">
        {plan.status === "AWAITING_APPROVAL" && (
          <>
            <button
              onClick={handleApprove}
              disabled={loading}
              className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}
        {plan.status === "APPROVED" && (
          <button
            onClick={handleExecute}
            disabled={loading}
            className="rounded bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Execute
          </button>
        )}
      </div>

      <div className="mb-6 rounded border bg-white p-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">Plan (Markdown)</h2>
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.plan_markdown}</ReactMarkdown>
        </div>
      </div>

      {plan.plan_json && plan.plan_json !== "{}" && (
        <div className="rounded border bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-600">Plan (JSON)</h2>
          <pre className="overflow-auto text-xs text-gray-600">
            {typeof plan.plan_json === "string"
              ? JSON.stringify(JSON.parse(plan.plan_json), null, 2)
              : JSON.stringify(plan.plan_json, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
