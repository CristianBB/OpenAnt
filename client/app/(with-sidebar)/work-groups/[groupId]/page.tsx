"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getWorkGroup } from "@/lib/tasks";
import type { WorkGroup } from "@/lib/types";

export default function WorkGroupDetailPage() {
  const params = useParams();
  const groupId = params.groupId as string;
  const [group, setGroup] = useState<(WorkGroup & { items: unknown[] }) | null>(null);

  useEffect(() => {
    getWorkGroup(groupId).then(setGroup);
  }, [groupId]);

  if (!group) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/projects/${group.project_id}/work-groups`} className="text-indigo-600 hover:underline">Work Groups</Link>
        <span>/</span>
        <span className="text-gray-700">{group.name}</span>
      </div>
      <h1 className="mb-2 text-2xl font-bold">{group.name}</h1>
      <p className="mb-6 text-sm text-gray-500">{group.summary || "No summary"}</p>

      <div className="rounded border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">Member Tasks</h2>
        {group.items.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks in this group.</p>
        ) : (
          <pre className="text-xs text-gray-600">{JSON.stringify(group.items, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
