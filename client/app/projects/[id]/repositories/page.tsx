"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface Repository {
  id: string;
  owner: string;
  name: string;
  default_branch: string;
  selected: number;
  analysis_json: string | null;
  analysis_status: "IDLE" | "ANALYZING" | "DONE" | "ERROR";
  analysis_error: string | null;
  last_analyzed_at: string | null;
}

interface RepoAnalysis {
  summary?: string;
  projects?: Array<{
    name: string;
    path: string;
    description: string;
    type: string;
    languages?: string[];
    frameworks?: string[];
    features?: string[];
  }>;
  conventions?: string[];
  testCommands?: string[];
  buildCommands?: string[];
  integrations?: string[];
  notes?: string;
  // Old schema field — used to detect legacy format
  purpose?: string;
}

interface GitHubRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
}

export default function RepositoriesPage() {
  const params = useParams();
  const id = params.id as string;
  const [repos, setRepos] = useState<Repository[]>([]);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [showGh, setShowGh] = useState(false);
  const [loadingGh, setLoadingGh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
  const [editingRepo, setEditingRepo] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [ghFilter, setGhFilter] = useState("");
  const [notifications, setNotifications] = useState<{ id: string; message: string }[]>([]);
  const prevAnalyzingRef = useRef<Set<string>>(new Set());

  const loadRepos = useCallback(async () => {
    try {
      const data = await apiFetch<Repository[]>(`/api/projects/${id}/repositories`);
      setRepos(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  // Poll while any repo is analyzing
  useEffect(() => {
    const hasAnalyzing = repos.some((r) => r.analysis_status === "ANALYZING");
    if (!hasAnalyzing) return;
    const timer = setInterval(() => {
      loadRepos();
    }, 4000);
    return () => clearInterval(timer);
  }, [repos, loadRepos]);

  // Detect completed analyses and show notifications
  useEffect(() => {
    const currentAnalyzing = new Set(
      repos.filter((r) => r.analysis_status === "ANALYZING").map((r) => r.id)
    );
    const justFinished = repos.filter(
      (r) => r.analysis_status === "DONE" && prevAnalyzingRef.current.has(r.id)
    );
    const justFailed = repos.filter(
      (r) => r.analysis_status === "ERROR" && prevAnalyzingRef.current.has(r.id)
    );

    for (const repo of justFinished) {
      setExpandedRepo(repo.id);
      const notifId = `done-${repo.id}-${Date.now()}`;
      setNotifications((prev) => [
        ...prev,
        { id: notifId, message: `Analysis complete: ${repo.owner}/${repo.name}` },
      ]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      }, 5000);
    }

    for (const repo of justFailed) {
      const notifId = `error-${repo.id}-${Date.now()}`;
      setNotifications((prev) => [
        ...prev,
        { id: notifId, message: `Analysis failed: ${repo.owner}/${repo.name}` },
      ]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      }, 8000);
    }

    prevAnalyzingRef.current = currentAnalyzing;
  }, [repos]);

  async function loadGhRepos() {
    setShowGh(true);
    setLoadingGh(true);
    try {
      const data = await apiFetch<GitHubRepo[]>(`/api/projects/${id}/github/repos`);
      setGhRepos(data);
    } catch {
      setGhRepos([]);
    } finally {
      setLoadingGh(false);
    }
  }

  async function selectRepo(r: GitHubRepo) {
    await apiFetch(`/api/projects/${id}/repositories/select`, {
      method: "POST",
      body: JSON.stringify({
        repos: [{ owner: r.owner, name: r.name, default_branch: r.defaultBranch, github_repo_id: r.id }],
      }),
    });
    await loadRepos();
  }

  async function analyzeRepo(repoId: string) {
    try {
      await apiFetch(`/api/repositories/${repoId}/analyze`, { method: "POST" });
      await loadRepos();
    } catch (err: any) {
      alert(`Analysis failed: ${err.message}`);
    }
  }

  async function removeRepo(repoId: string) {
    if (!confirm("Remove this repository from the project?")) return;
    await apiFetch(`/api/repositories/${repoId}`, { method: "DELETE" });
    await loadRepos();
  }

  function getAnalysis(repo: Repository): RepoAnalysis | null {
    if (!repo.analysis_json) return null;
    try {
      return JSON.parse(repo.analysis_json);
    } catch {
      return null;
    }
  }

  function startEdit(repo: Repository) {
    const analysis = getAnalysis(repo) ?? {
      summary: "",
      projects: [],
      conventions: [],
      testCommands: [],
      buildCommands: [],
      integrations: [],
      notes: "",
    };
    setEditText(JSON.stringify(analysis, null, 2));
    setEditingRepo(repo.id);
    setExpandedRepo(repo.id);
  }

  async function saveEdit(repoId: string) {
    setSavingEdit(true);
    try {
      const parsed = JSON.parse(editText);
      await apiFetch(`/api/repositories/${repoId}/analysis`, {
        method: "PATCH",
        body: JSON.stringify(parsed),
      });
      setEditingRepo(null);
      await loadRepos();
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  function renderAnalysisSection(label: string, items: unknown[] | undefined) {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</h4>
        <ul className="space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="text-sm font-mono bg-gray-50 px-2 py-1 rounded">
              {typeof item === "string" ? item : typeof item === "object" && item !== null ? (item as any).name ?? JSON.stringify(item) : String(item)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const filteredGhRepos = ghFilter
    ? ghRepos.filter((r) => r.fullName.toLowerCase().includes(ghFilter.toLowerCase()))
    : ghRepos;

  const addedFullNames = new Set(repos.map((r) => `${r.owner}/${r.name}`));
  const availableGhRepos = filteredGhRepos.filter((r) => !addedFullNames.has(r.fullName));

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-8">
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-lg px-4 py-3 text-sm shadow-lg ${
                n.id.startsWith("error-")
                  ? "bg-red-600 text-white"
                  : "bg-green-600 text-white"
              }`}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Repositories</h1>
        <button
          onClick={loadGhRepos}
          disabled={loadingGh}
          className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900 disabled:opacity-50"
        >
          {loadingGh ? "Loading..." : "Add from GitHub"}
        </button>
      </div>

      {repos.length > 0 && (
        <div className="mb-6 space-y-3">
          {repos.map((repo) => {
            const analysis = getAnalysis(repo);
            const isExpanded = expandedRepo === repo.id;
            const isAnalyzing = repo.analysis_status === "ANALYZING";
            const hasError = repo.analysis_status === "ERROR";
            const isEditing = editingRepo === repo.id;

            return (
              <div key={repo.id} className="rounded border bg-white">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpandedRepo(isExpanded ? null : repo.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {isExpanded ? "▼" : "▶"}
                    </button>
                    <div>
                      <span className="font-mono text-sm font-medium">{repo.owner}/{repo.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{repo.default_branch}</span>
                      {isAnalyzing && (
                        <span className="ml-2 text-xs text-blue-600 animate-pulse">Analyzing...</span>
                      )}
                      {repo.last_analyzed_at && !isAnalyzing && (
                        <span className="ml-2 text-xs text-green-600">
                          Analyzed {new Date(repo.last_analyzed_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => analyzeRepo(repo.id)}
                      disabled={isAnalyzing}
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isAnalyzing ? "Analyzing..." : analysis ? "Re-analyze" : "Analyze"}
                    </button>
                    <button
                      onClick={() => startEdit(repo)}
                      className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeRepo(repo.id)}
                      className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {hasError && (
                  <div className="border-t px-4 py-2 bg-red-50">
                    <p className="text-xs text-red-700">
                      Analysis error: {repo.analysis_error ?? "Unknown error"}
                    </p>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t px-4 py-4">
                    {isEditing ? (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">
                          Edit the repository analysis. This information is used by the LLM when processing tasks and generating plans.
                        </p>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={16}
                          className="w-full rounded border px-3 py-2 text-sm font-mono"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => saveEdit(repo.id)}
                            disabled={savingEdit}
                            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingRepo(null)}
                            className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : analysis ? (
                      <div className="space-y-4">
                        {/* Legacy format detection */}
                        {analysis.purpose && !analysis.summary && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-sm text-yellow-800">
                            This analysis uses an older format. Click &quot;Re-analyze&quot; to update.
                          </div>
                        )}
                        {analysis.summary && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Summary</h4>
                            <p className="text-sm text-gray-700">{analysis.summary}</p>
                          </div>
                        )}
                        {analysis.projects && analysis.projects.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Projects</h4>
                            <ul className="space-y-3">
                              {analysis.projects.map((p, i) => (
                                <li key={i} className="bg-gray-50 px-3 py-3 rounded">
                                  <div className="flex items-baseline gap-2 mb-1">
                                    <span className="text-sm font-medium">{p.name}</span>
                                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{p.type}</span>
                                    {p.path !== "." && <span className="text-xs text-gray-400 font-mono">{p.path}</span>}
                                  </div>
                                  <p className="text-sm text-gray-600 mb-2">{p.description}</p>
                                  {((p.languages && p.languages.length > 0) || (p.frameworks && p.frameworks.length > 0)) && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                      {p.languages?.map((l, j) => (
                                        <span key={`l-${j}`} className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{l}</span>
                                      ))}
                                      {p.frameworks?.map((f, j) => (
                                        <span key={`f-${j}`} className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{f}</span>
                                      ))}
                                    </div>
                                  )}
                                  {p.features && p.features.length > 0 && (
                                    <ul className="space-y-0.5">
                                      {p.features.map((feat, j) => (
                                        <li key={j} className="text-xs text-gray-500 pl-3 relative before:content-['•'] before:absolute before:left-0">
                                          {typeof feat === "string" ? feat : typeof feat === "object" && feat !== null ? (feat as any).name ?? JSON.stringify(feat) : String(feat)}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          {renderAnalysisSection("Conventions", analysis.conventions)}
                          {renderAnalysisSection("Integrations", analysis.integrations)}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {renderAnalysisSection("Test Commands", analysis.testCommands)}
                          {renderAnalysisSection("Build Commands", analysis.buildCommands)}
                        </div>
                        {analysis.notes && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Notes</h4>
                            <p className="text-sm text-gray-700">{analysis.notes}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No analysis yet. Click &quot;Analyze&quot; to run LLM-powered analysis, or &quot;Edit&quot; to enter information manually.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {repos.length === 0 && !showGh && (
        <p className="text-gray-500">No repositories selected. Click &quot;Add from GitHub&quot; to get started.</p>
      )}

      {showGh && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">GitHub Repositories</h2>
            <button
              onClick={() => setShowGh(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <input
            type="text"
            placeholder="Filter repositories..."
            value={ghFilter}
            onChange={(e) => setGhFilter(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />

          {loadingGh ? (
            <p className="text-sm text-gray-500">Loading repositories from GitHub...</p>
          ) : availableGhRepos.length > 0 ? (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {availableGhRepos.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <span className="font-mono text-sm">{r.fullName}</span>
                    {r.private && <span className="ml-2 text-xs text-yellow-600">private</span>}
                    {r.description && <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>}
                  </div>
                  <button
                    onClick={() => selectRepo(r)}
                    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {ghFilter ? "No matching repositories found." : "No additional repositories available."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
