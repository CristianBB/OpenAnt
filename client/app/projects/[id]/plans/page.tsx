"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { listPlans } from "@/lib/plans";
import type { Plan } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  GENERATING: "bg-blue-100 text-blue-800",
  DRAFT: "bg-gray-100 text-gray-800",
  AWAITING_APPROVAL: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  EXECUTING: "bg-purple-100 text-purple-800",
  DONE: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function PlansPage() {
  const params = useParams();
  const id = params.id as string;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlans = useCallback(() => {
    return listPlans(id).then(setPlans).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Poll while any plan is generating
  useEffect(() => {
    const hasGenerating = plans.some((p) => p.status === "GENERATING");
    if (!hasGenerating) return;
    const timer = setInterval(() => {
      loadPlans();
    }, 4000);
    return () => clearInterval(timer);
  }, [plans, loadPlans]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Plans</h1>

      {plans.length === 0 ? (
        <p className="text-gray-500">No plans yet. Generate a plan from a task or work group.</p>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <Link
              key={p.id}
              href={`/plans/${p.id}`}
              className="block rounded border bg-white p-4 hover:border-blue-300"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>
                  {p.status}
                </span>
                <span className="text-sm text-gray-500">
                  {p.task_id ? `Task plan` : p.work_group_id ? `Group plan` : "Plan"}
                </span>
                <span className="text-xs text-gray-400">{p.created_at}</span>
              </div>
              {p.status === "GENERATING" && (
                <p className="mt-1 text-sm text-blue-500 animate-pulse">Generating plan...</p>
              )}
              {p.status === "FAILED" && p.agent_error && (
                <p className="mt-1 text-sm text-red-500">{p.agent_error}</p>
              )}
              {p.plan_markdown && p.status !== "GENERATING" && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{p.plan_markdown.slice(0, 150)}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
