import Link from "next/link";
import type { Task } from "@/lib/types";

const statusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  PLANNED: "bg-purple-100 text-purple-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  BLOCKED: "bg-red-100 text-red-800",
  DONE: "bg-green-100 text-green-800",
  WONTFIX: "bg-gray-100 text-gray-800",
};

export default function TaskCard({ task }: { task: Task }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="block rounded border bg-white p-4 transition hover:shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{task.title}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[task.status] ?? "bg-gray-100 text-gray-800"}`}
        >
          {task.status}
        </span>
      </div>
      {task.description && (
        <p className="line-clamp-2 text-sm text-gray-500">{task.description}</p>
      )}
      <div className="mt-2 text-xs text-gray-400">
        Priority: {task.priority} &middot; {new Date(task.created_at).toLocaleDateString()}
      </div>
    </Link>
  );
}
