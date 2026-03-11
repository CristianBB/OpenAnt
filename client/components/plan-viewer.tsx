import type { Plan } from "@/lib/types";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  AWAITING_APPROVAL: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  EXECUTING: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function PlanViewer({ plan }: { plan: Plan }) {
  return (
    <div className="rounded border bg-white">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-medium">Plan {plan.id.slice(0, 8)}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[plan.status] ?? "bg-gray-100 text-gray-800"}`}
        >
          {plan.status}
        </span>
      </div>
      <div className="p-4">
        <div className="whitespace-pre-wrap text-sm text-gray-700">
          {plan.plan_markdown}
        </div>
      </div>
    </div>
  );
}
