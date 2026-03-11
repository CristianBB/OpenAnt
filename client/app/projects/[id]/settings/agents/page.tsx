"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

const AGENTS = [
  { key: "task-assignment", label: "Task Assignment Agent" },
  { key: "repo-analysis", label: "Repo Analysis Agent" },
  { key: "plan-generation", label: "Plan Generation Agent" },
];

export default function AgentSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<{ status: string; agentOverrides?: Record<string, string> }>(
      `/api/projects/${projectId}/integrations/openrouter/status`
    )
      .then((data) => {
        if (data.agentOverrides) setOverrides(data.agentOverrides);
      })
      .catch(() => {});
  }, [projectId]);

  async function handleSave() {
    setSaving(true);
    await apiFetch(`/api/projects/${projectId}/integrations/openrouter`, {
      method: "PATCH",
      body: JSON.stringify({ agentOverrides: overrides }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Agent Instructions</h1>
      <p className="mb-6 text-sm text-gray-500">
        Override the default agent instructions for this project. Leave blank to use defaults.
      </p>

      <div className="space-y-6">
        {AGENTS.map((agent) => (
          <div key={agent.key}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {agent.label}
            </label>
            <textarea
              value={overrides[agent.key] ?? ""}
              onChange={(e) =>
                setOverrides((prev) => ({ ...prev, [agent.key]: e.target.value }))
              }
              rows={6}
              placeholder="Additional instructions for this agent in this project..."
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Overrides"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </div>
  );
}
