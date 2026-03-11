"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  listChannels,
  listChannelMessages,
  retryMessage,
  forceTriage,
  updateChannel,
  deleteChannel,
  connectGmail,
  connectGmailOAuth,
  exchangeGmailOAuthCode,
  connectSlack,
  connectGitHubIssues,
  getChannelConfig,
} from "@/lib/channels";
import type { Channel, SourceMessage } from "@/lib/types";

interface ChannelWithCounts extends Channel {
  message_count: number;
  pending_count: number;
}

export default function ChannelsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [channels, setChannels] = useState<ChannelWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<string | null>(null);

  // Gmail form
  const [gmailAuthMode, setGmailAuthMode] = useState<"oauth" | "appPassword">("oauth");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailError, setGmailError] = useState("");

  // Gmail OAuth form
  const [gmailClientId, setGmailClientId] = useState("");
  const [gmailClientSecret, setGmailClientSecret] = useState("");
  const [gmailOAuthConnecting, setGmailOAuthConnecting] = useState(false);
  const [gmailOAuthError, setGmailOAuthError] = useState("");

  // Slack form
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackAppToken, setSlackAppToken] = useState("");
  const [slackName, setSlackName] = useState("");

  // GitHub Issues form
  const [ghRepoIds, setGhRepoIds] = useState<string[]>([]);
  const [ghName, setGhName] = useState("");
  const [availableRepos, setAvailableRepos] = useState<Array<{ id: string; owner: string; name: string }>>([]);

  // Messages expansion state
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [channelMessages, setChannelMessages] = useState<SourceMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [triaging, setTriaging] = useState(false);

  // Edit state
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const existingKinds = new Set(channels.map((ch) => ch.kind));

  useEffect(() => {
    loadChannels();
    loadRepos();
  }, [id]);

  // Handle Gmail OAuth callback
  useEffect(() => {
    const code = searchParams.get("gmail_code");
    if (!code) return;

    const storedClientId = sessionStorage.getItem("gmail_clientId");
    const storedClientSecret = sessionStorage.getItem("gmail_clientSecret");
    if (!storedClientId || !storedClientSecret) return;

    setGmailOAuthConnecting(true);
    setGmailOAuthError("");
    setShowForm("gmail");

    exchangeGmailOAuthCode(id, {
      code,
      clientId: storedClientId,
      clientSecret: storedClientSecret,
    }).then(() => {
      sessionStorage.removeItem("gmail_clientId");
      sessionStorage.removeItem("gmail_clientSecret");
      window.history.replaceState({}, "", window.location.pathname);
      setShowForm(null);
      loadChannels();
    }).catch((err: any) => {
      setGmailOAuthError(err?.message || "Gmail OAuth failed. Please try again.");
    }).finally(() => {
      setGmailOAuthConnecting(false);
    });
  }, [id, searchParams]);

  async function loadChannels() {
    setLoading(true);
    try {
      const data = await listChannels(id);
      setChannels(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadRepos() {
    try {
      const { apiFetch } = await import("@/lib/api");
      const repos = await apiFetch<Array<{ id: string; owner: string; name: string }>>(
        `/api/projects/${id}/repositories`
      );
      setAvailableRepos(repos);
    } catch { /* no repos yet */ }
  }

  async function toggleMessages(channelId: string) {
    if (expandedChannelId === channelId) {
      setExpandedChannelId(null);
      setChannelMessages([]);
      return;
    }
    setExpandedChannelId(channelId);
    setLoadingMessages(true);
    try {
      const msgs = await listChannelMessages(channelId);
      setChannelMessages(msgs);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleToggle(ch: ChannelWithCounts) {
    await updateChannel(ch.id, { enabled: !ch.enabled });
    await loadChannels();
  }

  async function handleDelete(channelId: string) {
    if (!confirm("Delete this channel? This will also remove all its messages.")) return;
    await deleteChannel(channelId);
    await loadChannels();
  }

  async function handleGmailConnect(e: React.FormEvent) {
    e.preventDefault();
    setGmailConnecting(true);
    setGmailError("");
    try {
      await connectGmail(id, { email: gmailEmail, appPassword: gmailAppPassword });
      setShowForm(null);
      setGmailEmail("");
      setGmailAppPassword("");
      await loadChannels();
    } catch (err: any) {
      setGmailError(err?.message || "Could not connect to Gmail. Check your email and app password.");
    } finally {
      setGmailConnecting(false);
    }
  }

  async function handleGmailOAuthConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!gmailClientId || !gmailClientSecret) return;
    setGmailOAuthConnecting(true);
    setGmailOAuthError("");
    try {
      const result = await connectGmailOAuth(id, {
        clientId: gmailClientId,
        clientSecret: gmailClientSecret,
      });
      sessionStorage.setItem("gmail_clientId", gmailClientId);
      sessionStorage.setItem("gmail_clientSecret", gmailClientSecret);
      window.location.href = result.url;
    } catch (err: any) {
      setGmailOAuthError(err?.message || "Failed to start OAuth flow.");
      setGmailOAuthConnecting(false);
    }
  }

  async function handleSlackConnect(e: React.FormEvent) {
    e.preventDefault();
    await connectSlack(id, {
      botToken: slackBotToken,
      appToken: slackAppToken,
      name: slackName || "Slack",
    });
    setShowForm(null);
    setSlackBotToken("");
    setSlackAppToken("");
    setSlackName("");
    await loadChannels();
  }

  async function handleGhIssuesConnect(e: React.FormEvent) {
    e.preventDefault();
    if (ghRepoIds.length === 0) return;
    await connectGitHubIssues(id, {
      repositoryIds: ghRepoIds,
      name: ghName || "GitHub Issues",
    });
    setShowForm(null);
    setGhRepoIds([]);
    setGhName("");
    await loadChannels();
  }

  async function startEditing(ch: ChannelWithCounts) {
    setEditLoading(true);
    setEditingChannelId(ch.id);
    try {
      const data = await getChannelConfig(ch.id);
      setEditName(data.name);
      setEditConfig(data.config);
    } catch {
      setEditingChannelId(null);
    } finally {
      setEditLoading(false);
    }
  }

  function cancelEditing() {
    setEditingChannelId(null);
    setEditName("");
    setEditConfig({});
  }

  async function handleSaveEdit(ch: ChannelWithCounts) {
    setEditSaving(true);
    try {
      await updateChannel(ch.id, { name: editName, config: editConfig });
      setEditingChannelId(null);
      setEditName("");
      setEditConfig({});
      await loadChannels();
    } finally {
      setEditSaving(false);
    }
  }

  function renderEditForm(ch: ChannelWithCounts) {
    if (editLoading) return <p className="text-sm text-gray-500">Loading config...</p>;

    return (
      <div className="mt-3 space-y-3 border-t pt-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Channel Name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>

        {ch.kind === "GMAIL" && (
          <>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Email</label>
              <input
                value={(editConfig.email as string) || ""}
                disabled
                className="w-full rounded border bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">App Password</label>
              <input
                type="password"
                value={(editConfig.appPassword as string) || ""}
                onChange={(e) => setEditConfig({ ...editConfig, appPassword: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {ch.kind === "SLACK" && (
          <>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Bot Token (xoxb-...)</label>
              <input
                type="password"
                value={(editConfig.botToken as string) || ""}
                onChange={(e) => setEditConfig({ ...editConfig, botToken: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">App-Level Token (xapp-...)</label>
              <input
                type="password"
                value={(editConfig.appToken as string) || ""}
                onChange={(e) => setEditConfig({ ...editConfig, appToken: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {ch.kind === "GITHUB_ISSUES" && (
          <div>
            <label className="mb-2 block text-xs text-gray-500">Repositories</label>
            {availableRepos.length === 0 ? (
              <p className="text-xs text-gray-400">No repositories found.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                {availableRepos.map((r) => {
                  const repoIds = (editConfig.repositoryIds as string[]) || [];
                  return (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={repoIds.includes(r.id)}
                        onChange={(e) => {
                          const newIds = e.target.checked
                            ? [...repoIds, r.id]
                            : repoIds.filter((x) => x !== r.id);
                          setEditConfig({ ...editConfig, repositoryIds: newIds });
                        }}
                      />
                      {r.owner}/{r.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => handleSaveEdit(ch)}
            disabled={editSaving}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {editSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={cancelEditing}
            className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Channels</h1>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setTriaging(true);
              try {
                await forceTriage(id);
                await loadChannels();
                if (expandedChannelId) {
                  const msgs = await listChannelMessages(expandedChannelId);
                  setChannelMessages(msgs);
                }
              } finally {
                setTriaging(false);
              }
            }}
            disabled={triaging}
            className="rounded border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-100 disabled:opacity-50"
          >
            {triaging ? "Triaging..." : "Run Triage"}
          </button>
          <button
            onClick={() => setShowForm("gmail")}
            disabled={existingKinds.has("GMAIL")}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Gmail
          </button>
          <button
            onClick={() => setShowForm("slack")}
            disabled={existingKinds.has("SLACK")}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Slack
          </button>
          <button
            onClick={() => setShowForm("github")}
            disabled={existingKinds.has("GITHUB_ISSUES")}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + GitHub Issues
          </button>
        </div>
      </div>

      {/* Gmail form */}
      {showForm === "gmail" && (
        <section className="mb-6 rounded border bg-white p-5">
          <h3 className="mb-3 font-semibold">Connect Gmail</h3>

          {/* Auth mode selector */}
          <div className="mb-4 flex rounded border">
            <button
              type="button"
              onClick={() => setGmailAuthMode("oauth")}
              className={`flex-1 px-3 py-2 text-sm font-medium ${gmailAuthMode === "oauth" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              OAuth (recommended)
            </button>
            <button
              type="button"
              onClick={() => setGmailAuthMode("appPassword")}
              className={`flex-1 px-3 py-2 text-sm font-medium ${gmailAuthMode === "appPassword" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              App Password
            </button>
          </div>

          {gmailAuthMode === "oauth" ? (
            <>
              <div className="mb-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                <p className="mb-2 font-medium">How to set up Google OAuth credentials:</p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>Go to <strong>Google Cloud Console</strong> and create a project (or select an existing one)</li>
                  <li>Navigate to <strong>APIs &amp; Services &gt; Library</strong>, search for <strong>&quot;Gmail API&quot;</strong> and enable it</li>
                  <li>Go to <strong>APIs &amp; Services &gt; Credentials</strong></li>
                  <li>If prompted, configure the <strong>OAuth consent screen</strong> (User type: External, fill required fields, add your email as test user)</li>
                  <li>Click <strong>Create Credentials &gt; OAuth 2.0 Client ID</strong></li>
                  <li>Application type: <strong>Web application</strong></li>
                  <li>Under <strong>Authorized redirect URIs</strong>, add: <code className="rounded bg-gray-200 px-1">{process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"}/api/gmail/oauth/callback</code></li>
                  <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> and paste them below</li>
                </ol>
              </div>
              {gmailOAuthError && (
                <p className="mb-3 text-sm text-red-600">{gmailOAuthError}</p>
              )}
              {gmailOAuthConnecting && (
                <p className="mb-3 text-sm text-blue-600">Connecting to Gmail via OAuth...</p>
              )}
              <form onSubmit={handleGmailOAuthConnect} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Client ID</label>
                  <input
                    value={gmailClientId}
                    onChange={(e) => setGmailClientId(e.target.value)}
                    required
                    placeholder="123456789-xxxxxxxxx.apps.googleusercontent.com"
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Client Secret</label>
                  <input
                    type="password"
                    value={gmailClientSecret}
                    onChange={(e) => setGmailClientSecret(e.target.value)}
                    required
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={gmailOAuthConnecting}
                    className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {gmailOAuthConnecting ? "Connecting..." : "Authorize with Google"}
                  </button>
                  <button type="button" onClick={() => setShowForm(null)} className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="mb-3 rounded bg-gray-50 p-3 text-xs text-gray-600">
                <p className="mb-2 font-medium">How to create a Google App Password:</p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>Enable <strong>2-Step Verification</strong> on your Google account if not already active</li>
                  <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">myaccount.google.com/apppasswords</a></li>
                  <li>Enter a name (e.g. &quot;OpenAnt&quot;) and click Create</li>
                  <li>Copy the 16-character password and paste it below</li>
                </ol>
                <p className="mt-2 text-yellow-700">Note: App Passwords may not be available for Google Workspace accounts. Use OAuth instead.</p>
              </div>
              {gmailError && (
                <p className="mb-3 text-sm text-red-600">{gmailError}</p>
              )}
              <form onSubmit={handleGmailConnect} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Email</label>
                  <input type="email" value={gmailEmail} onChange={(e) => setGmailEmail(e.target.value)} required placeholder="you@gmail.com" className="w-full rounded border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">App Password</label>
                  <input type="password" value={gmailAppPassword} onChange={(e) => setGmailAppPassword(e.target.value)} required placeholder="xxxx xxxx xxxx xxxx" className="w-full rounded border px-3 py-2 text-sm" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={gmailConnecting} className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                    {gmailConnecting ? "Connecting..." : "Connect"}
                  </button>
                  <button type="button" onClick={() => setShowForm(null)} className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            </>
          )}
        </section>
      )}

      {/* Slack form */}
      {showForm === "slack" && (
        <section className="mb-6 rounded border bg-white p-5">
          <h3 className="mb-3 font-semibold">Connect Slack</h3>
          <p className="mb-3 text-xs text-gray-500">
            Create a Slack App with Socket Mode enabled, then paste your tokens below.
          </p>
          <form onSubmit={handleSlackConnect} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Channel Name</label>
              <input value={slackName} onChange={(e) => setSlackName(e.target.value)} placeholder="e.g., My Workspace" className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Bot Token (xoxb-...)</label>
              <input type="password" value={slackBotToken} onChange={(e) => setSlackBotToken(e.target.value)} required className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">App-Level Token (xapp-...)</label>
              <input type="password" value={slackAppToken} onChange={(e) => setSlackAppToken(e.target.value)} required className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="rounded bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700">Connect</button>
              <button type="button" onClick={() => setShowForm(null)} className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </section>
      )}

      {/* GitHub Issues form */}
      {showForm === "github" && (
        <section className="mb-6 rounded border bg-white p-5">
          <h3 className="mb-3 font-semibold">Watch GitHub Issues</h3>
          <p className="mb-3 text-xs text-gray-500">
            Select which repositories to monitor for new issues and comments. Requires GitHub to be connected in Integrations.
          </p>
          <form onSubmit={handleGhIssuesConnect} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Channel Name</label>
              <input value={ghName} onChange={(e) => setGhName(e.target.value)} placeholder="e.g., GitHub Issues" className="w-full rounded border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-2 block text-xs text-gray-500">Repositories</label>
              {availableRepos.length === 0 ? (
                <p className="text-xs text-gray-400">No repositories found. Add repos in the Repositories page first.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                  {availableRepos.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ghRepoIds.includes(r.id)}
                        onChange={(e) => {
                          if (e.target.checked) setGhRepoIds((prev) => [...prev, r.id]);
                          else setGhRepoIds((prev) => prev.filter((x) => x !== r.id));
                        }}
                      />
                      {r.owner}/{r.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={ghRepoIds.length === 0} className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900 disabled:opacity-50">Connect</button>
              <button type="button" onClick={() => setShowForm(null)} className="rounded border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </section>
      )}

      {/* Channel list */}
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : channels.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-gray-500">
          <p className="mb-2">No channels configured yet.</p>
          <p className="text-sm">Add a channel above to start receiving messages from Gmail, Slack, or GitHub Issues.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch.id} className="rounded border bg-white p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                  {ch.kind === "GMAIL" ? "G" : ch.kind === "SLACK" ? "S" : "GH"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ch.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{ch.kind}</span>
                    {!ch.enabled && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">Disabled</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    <button
                      onClick={() => toggleMessages(ch.id)}
                      className="text-blue-500 hover:text-blue-700 hover:underline"
                    >
                      {ch.message_count} messages {expandedChannelId === ch.id ? "▾" : "▸"}
                    </button>
                    {ch.pending_count > 0 && <span className="ml-2 text-orange-500">{ch.pending_count} pending</span>}
                    {ch.last_poll_at && <span className="ml-2">Last polled: {new Date(ch.last_poll_at).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEditing(ch)}
                    disabled={editingChannelId === ch.id}
                    className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggle(ch)}
                    className={`rounded px-2 py-1 text-xs ${ch.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                  >
                    {ch.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => handleDelete(ch.id)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editingChannelId === ch.id && renderEditForm(ch)}
              {expandedChannelId === ch.id && (
                <div className="mt-3 border-t pt-3">
                  {loadingMessages ? (
                    <p className="text-sm text-gray-500">Loading messages...</p>
                  ) : channelMessages.length === 0 ? (
                    <p className="text-sm text-gray-400">No messages yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {channelMessages.map((msg) => {
                        // Parse source info from external_id
                        const ghMatch = msg.external_id.match(/^(?:issue|comment):(.+?)#/);
                        const sourceLabel = ghMatch ? ghMatch[1] : null;
                        return (
                        <div key={msg.id} className="rounded border bg-gray-50 p-3">
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className={`rounded px-1.5 py-0.5 ${
                              msg.triage_status === "PENDING" ? "bg-orange-100 text-orange-700" :
                              msg.triage_status === "TRIAGED" ? "bg-green-100 text-green-700" :
                              msg.triage_status === "DISMISSED" ? "bg-gray-200 text-gray-500" :
                              msg.triage_status === "ERROR" ? "bg-red-100 text-red-700" :
                              "bg-blue-100 text-blue-700"
                            }`}>{msg.triage_status}</span>
                            {msg.triage_classification && (
                              <span className="rounded bg-gray-200 px-1.5 py-0.5">{msg.triage_classification}</span>
                            )}
                            {sourceLabel && (
                              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-white">{sourceLabel}</span>
                            )}
                            {!sourceLabel && ch.kind === "SLACK" && msg.subject && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">{msg.subject}</span>
                            )}
                            {msg.sender_name && <span>{msg.sender_name}</span>}
                            {msg.sender_email && <span className="text-gray-400">&lt;{msg.sender_email}&gt;</span>}
                            <span className="ml-auto flex items-center gap-2">
                              <span>{new Date(msg.received_at).toLocaleString()}</span>
                              {msg.triage_status !== "PENDING" && (
                                <button
                                  onClick={async () => {
                                    await retryMessage(msg.id);
                                    const msgs = await listChannelMessages(ch.id);
                                    setChannelMessages(msgs);
                                  }}
                                  className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700 hover:bg-orange-200"
                                >
                                  Retry
                                </button>
                              )}
                            </span>
                          </div>
                          {msg.subject && ch.kind !== "SLACK" && <p className="mb-1 text-sm font-medium">{msg.subject}</p>}
                          <p className="whitespace-pre-wrap text-sm text-gray-600 line-clamp-4">{msg.content}</p>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
