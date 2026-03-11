"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProjects, createProject, seedDemoData, type Project } from "@/lib/projects";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const project = await createProject(name);
      setProjects((prev) => [project, ...prev]);
      setName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Project
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            required
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="text-gray-500">No projects yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded border bg-white p-4 hover:border-blue-300"
            >
              <Link href={`/projects/${p.id}/tasks`} className="flex-1">
                <h2 className="font-semibold">{p.name}</h2>
                {p.description && (
                  <p className="mt-1 text-sm text-gray-500">{p.description}</p>
                )}
              </Link>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  await seedDemoData(p.id);
                  alert("Demo data seeded!");
                }}
                className="ml-4 shrink-0 rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Seed Demo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
