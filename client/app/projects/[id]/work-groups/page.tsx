"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { listWorkGroups } from "@/lib/tasks";
import type { WorkGroup } from "@/lib/types";

export default function WorkGroupsPage() {
  const params = useParams();
  const id = params.id as string;
  const [groups, setGroups] = useState<WorkGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listWorkGroups(id).then(setGroups).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Work Groups</h1>

      {groups.length === 0 ? (
        <p className="text-gray-500">No work groups yet.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`/work-groups/${g.id}`}
              className="block rounded border bg-white p-4 hover:border-blue-300"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${g.status === "DONE" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                  {g.status}
                </span>
                <span className="font-medium">{g.name}</span>
              </div>
              {g.summary && <p className="mt-1 text-sm text-gray-500">{g.summary}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
