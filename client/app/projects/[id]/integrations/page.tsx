"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getIntegrationStatus,
  saveOpenRouterConfig,
  saveAnthropicConfig,
  getGitHubStatus,
  getOpenRouterConfig,
  getAnthropicConfig,
  connectGitHub,
  exchangeGitHubCode,
  disconnectGitHub,
} from "@/lib/projects";

export default function IntegrationsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [ghStatus, setGhStatus] = useState<{ connected: boolean; login?: string }>({ connected: false });
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState("");

  const [openrouter, setOpenrouter] = useState({
    apiKey: "",
    assignmentModel: "anthropic/claude-3.5-sonnet",
    planningModel: "anthropic/claude-3.5-sonnet",
    hasApiKey: false,
  });

  const [github, setGithub] = useState({
    clientId: "",
    clientSecret: "",
  });

  const [anthropic, setAnthropic] = useState({
    apiKey: "",
    model: "claude-sonnet-4-6",
    hasApiKey: false,
  });

  const [showGithubForm, setShowGithubForm] = useState(false);

  useEffect(() => {
    getIntegrationStatus(id).then(setStatus);
    getGitHubStatus(id).then(setGhStatus);

    getOpenRouterConfig(id).then((data) => {
      if (data.configured) {
        setOpenrouter((prev) => ({
          ...prev,
          apiKey: "", // Never pre-fill secrets from API
          assignmentModel: data.assignmentModel ?? "anthropic/claude-3.5-sonnet",
          planningModel: data.planningModel ?? "anthropic/claude-3.5-sonnet",
          hasApiKey: data.hasApiKey ?? false,
        }));
      }
    });

    getAnthropicConfig(id).then((data) => {
      if (data.configured) {
        setAnthropic((prev) => ({
          ...prev,
          apiKey: "",
          model: data.model ?? "claude-sonnet-4-6",
          hasApiKey: data.hasApiKey ?? false,
        }));
      }
    });
  }, [id]);

  // Handle GitHub OAuth callback
  useEffect(() => {
    const code = searchParams.get("github_code");
    if (!code) return;

    const storedClientId = sessionStorage.getItem("gh_clientId");
    const storedClientSecret = sessionStorage.getItem("gh_clientSecret");
    if (!storedClientId || !storedClientSecret) return;

    exchangeGitHubCode(id, {
      code,
      clientId: storedClientId,
      clientSecret: storedClientSecret,
    }).then((result) => {
      setGhStatus({ connected: result.connected, login: result.login });
      setStatus((s) => ({ ...s, github: true }));
      sessionStorage.removeItem("gh_clientId");
      sessionStorage.removeItem("gh_clientSecret");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }).catch((err) => {
      alert(`GitHub OAuth failed: ${err.message}`);
    });
  }, [id, searchParams]);

  async function saveOR(e: React.FormEvent) {
    e.preventDefault();
    setSaving("openrouter");
    await saveOpenRouterConfig(id, openrouter);
    setStatus((s) => ({ ...s, openrouter: true }));
    setSaving("");
    setSaved("openrouter");
    setTimeout(() => setSaved(""), 2000);
  }

  async function saveAnth(e: React.FormEvent) {
    e.preventDefault();
    setSaving("anthropic");
    await saveAnthropicConfig(id, anthropic);
    setStatus((s) => ({ ...s, anthropic: true }));
    setSaving("");
    setSaved("anthropic");
    setTimeout(() => setSaved(""), 2000);
  }

  async function handleGitHubConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!github.clientId || !github.clientSecret) return;

    try {
      const result = await connectGitHub(id, github);
      // Store credentials for the callback
      sessionStorage.setItem("gh_clientId", github.clientId);
      sessionStorage.setItem("gh_clientSecret", github.clientSecret);
      // Redirect to GitHub
      window.location.href = result.url;
    } catch (err: any) {
      alert(`Failed to connect: ${err.message}`);
    }
  }

  async function handleGitHubDisconnect() {
    await disconnectGitHub(id);
    setGhStatus({ connected: false });
    setStatus((s) => ({ ...s, github: false }));
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Integrations</h1>

      <section className="mb-8 rounded border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">OpenRouter</h2>
          <span className={`text-xs font-medium ${status.openrouter ? "text-green-600" : "text-gray-400"}`}>
            {status.openrouter ? "Configured" : "Not configured"}
          </span>
        </div>
        <form onSubmit={saveOR} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">API Key</label>
            <input
              placeholder={openrouter.hasApiKey ? "Key configured — leave blank to keep current" : "sk-or-..."}
              type="password"
              value={openrouter.apiKey}
              onChange={(e) => setOpenrouter({ ...openrouter, apiKey: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            {openrouter.hasApiKey && !openrouter.apiKey && (
              <p className="mt-1 text-xs text-green-600">API key is configured. Enter a new value to change it.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Assignment Model</label>
            <input
              value={openrouter.assignmentModel}
              onChange={(e) => setOpenrouter({ ...openrouter, assignmentModel: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Planning Model</label>
            <input
              value={openrouter.planningModel}
              onChange={(e) => setOpenrouter({ ...openrouter, planningModel: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving === "openrouter"}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving === "openrouter" ? "Saving..." : "Save"}
            </button>
            {saved === "openrouter" && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </form>
      </section>

      <section className="mb-8 rounded border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Anthropic (Plan Agent)</h2>
          <span className={`text-xs font-medium ${status.anthropic ? "text-green-600" : "text-gray-400"}`}>
            {status.anthropic ? "Configured" : "Not configured"}
          </span>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Required for AI-powered plan generation and implementation. Uses the Claude Agent SDK.
        </p>
        <form onSubmit={saveAnth} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">API Key</label>
            <input
              placeholder={anthropic.hasApiKey ? "Key configured — leave blank to keep current" : "sk-ant-..."}
              type="password"
              value={anthropic.apiKey}
              onChange={(e) => setAnthropic({ ...anthropic, apiKey: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            {anthropic.hasApiKey && !anthropic.apiKey && (
              <p className="mt-1 text-xs text-green-600">API key is configured. Enter a new value to change it.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Model</label>
            <select
              value={anthropic.model}
              onChange={(e) => setAnthropic({ ...anthropic, model: e.target.value })}
              className="w-full rounded border px-3 py-2 text-sm"
            >
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (recommended)</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5 (fast/cheap)</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving === "anthropic"}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving === "anthropic" ? "Saving..." : "Save"}
            </button>
            {saved === "anthropic" && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </form>
      </section>

      <section className="rounded border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">GitHub</h2>
          <span className={`text-xs font-medium ${ghStatus.connected ? "text-green-600" : "text-gray-400"}`}>
            {ghStatus.connected ? `Connected as ${ghStatus.login}` : "Not connected"}
          </span>
        </div>
        {ghStatus.connected ? (
          <button
            onClick={handleGitHubDisconnect}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Disconnect
          </button>
        ) : (
          <>
            {!showGithubForm ? (
              <button
                onClick={() => setShowGithubForm(true)}
                className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900"
              >
                Connect GitHub
              </button>
            ) : (
              <form onSubmit={handleGitHubConnect} className="space-y-3">
                <p className="text-xs text-gray-500">
                  Enter your GitHub OAuth App credentials. Create one at GitHub Settings &gt; Developer settings &gt; OAuth Apps.
                </p>
                <div className="rounded bg-gray-50 p-3 text-xs text-gray-600">
                  <p className="font-medium">When creating the OAuth App, use:</p>
                  <p className="mt-1"><span className="font-medium">Homepage URL:</span> {window.location.origin}</p>
                  <p><span className="font-medium">Authorization callback URL:</span> {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"}/api/github/oauth/callback</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Client ID</label>
                  <input
                    value={github.clientId}
                    onChange={(e) => setGithub({ ...github, clientId: e.target.value })}
                    placeholder="Iv1.xxxx..."
                    required
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Client Secret</label>
                  <input
                    type="password"
                    value={github.clientSecret}
                    onChange={(e) => setGithub({ ...github, clientSecret: e.target.value })}
                    required
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900"
                  >
                    Authorize with GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGithubForm(false)}
                    className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
