"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getProject, updateProject, type Project } from "@/lib/projects";

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    rules_nl: "",
    agent_policy_nl: "",
    max_parallel_runs: 2,
  });

  useEffect(() => {
    getProject(id)
      .then((p) => {
        setProject(p);
        setForm({
          name: p.name,
          description: p.description,
          rules_nl: p.rules_nl,
          agent_policy_nl: p.agent_policy_nl,
          max_parallel_runs: (p as any).max_parallel_runs ?? 2,
        });
      })
      .catch(() => router.push("/projects"));
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProject(id, form);
      setProject(updated);
    } finally {
      setSaving(false);
    }
  }

  if (!project) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Project Settings</h1>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Project Rules (natural language)</label>
          <textarea
            value={form.rules_nl}
            onChange={(e) => setForm({ ...form, rules_nl: e.target.value })}
            rows={5}
            placeholder="Describe project rules and constraints..."
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Agent Policy (natural language)</label>
          <textarea
            value={form.agent_policy_nl}
            onChange={(e) => setForm({ ...form, agent_policy_nl: e.target.value })}
            rows={5}
            placeholder="Describe agent behavior policies..."
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Max Parallel Runs</label>
          <p className="mb-1 text-xs text-gray-500">Maximum number of tasks that can be executed simultaneously.</p>
          <input
            type="number"
            min={1}
            max={10}
            value={form.max_parallel_runs}
            onChange={(e) => setForm({ ...form, max_parallel_runs: parseInt(e.target.value, 10) || 2 })}
            className="mt-1 w-24 rounded border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
