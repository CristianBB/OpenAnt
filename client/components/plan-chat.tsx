"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Plan, PlanConversation, PlanQuestion } from "@/lib/types";
import { ChatMessage } from "./chat-message";
import { DiffViewer } from "./diff-viewer";
import {
  getConversation,
  getQuestions,
  sendChatMessage,
  answerQuestion,
  startImplementation,
  streamPlanEvents,
  getPlanPullRequests,
  checkPlanMergeStatus,
} from "@/lib/plan-agent";
import { getRunDiff, pushAndCreatePR, type RepoDiff } from "@/lib/runs";
import { approvePlan, rejectPlan, getPlan, submitPlanForReview, retryPlan, requestPlanChanges } from "@/lib/plans";

interface PlanChatProps {
  plan: Plan;
  onPlanUpdate: (plan: Plan) => void;
}

const PHASE_LABELS: Record<string, string> = {
  analyzing: "Analyzing code...",
  questioning: "Waiting for your answer...",
  planning: "Creating plan...",
  chatting: "Ready to chat",
  implementing: "Implementing changes...",
  review: "Review changes",
  done: "Done",
  error: "Error",
};

export function PlanChat({ plan, onPlanUpdate }: PlanChatProps) {
  const onPlanUpdateRef = useRef(onPlanUpdate);
  onPlanUpdateRef.current = onPlanUpdate;
  const [messages, setMessages] = useState<PlanConversation[]>([]);
  const [streamingText, setStreamingText] = useState<string>("");
  const [toolActivity, setToolActivity] = useState<string>("");
  const [questions, setQuestions] = useState<PlanQuestion[]>([]);
  const [input, setInput] = useState("");
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diffs, setDiffs] = useState<RepoDiff[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [pushingPR, setPushingPR] = useState(false);
  const [prUrls, setPrUrls] = useState<string[]>([]);
  const [prStatuses, setPrStatuses] = useState<Array<{ url: string | null; status: string }>>([]);
  const [checkingMerge, setCheckingMerge] = useState(false);
  const [diffContext, setDiffContext] = useState(3);
  const [changeFeedback, setChangeFeedback] = useState("");
  const [showChangeFeedback, setShowChangeFeedback] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load initial data
  useEffect(() => {
    getConversation(plan.id).then(setMessages).catch((err) => {
      console.error("Failed to load conversation:", err);
    });
    getQuestions(plan.id).then(setQuestions).catch((err) => {
      console.error("Failed to load questions:", err);
    });
    // Load existing PRs and their statuses
    getPlanPullRequests(plan.id).then((prs) => {
      const urls = prs.map((pr) => pr.url).filter(Boolean) as string[];
      if (urls.length > 0) setPrUrls(urls);
      if (prs.length > 0) setPrStatuses(prs.map((pr) => ({ url: pr.url, status: pr.status })));
    }).catch(() => {});
  }, [plan.id]);

  // Load diffs if plan is already in review phase
  useEffect(() => {
    if (plan.agent_phase === "review" && plan.status === "EXECUTING") {
      import("@/lib/runs").then(({ listRunsByPlan }) => {
        listRunsByPlan(plan.id).then((runs) => {
          const activeRun = runs.find((r) => r.workspace_path);
          if (activeRun) {
            setRunId(activeRun.id);
            runIdRef.current = activeRun.id;
            fetchDiffs(activeRun.id);
          }
        });
      });
    }
  }, [plan.agent_phase, plan.status, plan.id]);

  // SSE streaming
  useEffect(() => {
    const cleanup = streamPlanEvents(plan.id, (event) => {
      if (event.type === "plan_state" && event.plan) {
        onPlanUpdateRef.current(event.plan);
      }
      if (event.type === "agent_message" || event.type === "implementation_message") {
        const msg = event.message as Record<string, unknown> | undefined;
        if (msg) {
          // Extract text from assistant messages
          if (msg.type === "assistant" && msg.message) {
            const inner = msg.message as Record<string, unknown>;
            const content = inner.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "text" && typeof block.text === "string") {
                  setStreamingText((prev) => prev + (prev ? "\n\n" : "") + block.text);
                  setToolActivity("");
                  setThinking(false);
                }
                // Show tool use activity
                if (block.type === "tool_use" && typeof block.name === "string") {
                  const input = block.input as Record<string, unknown> | undefined;
                  const detail = input?.file_path || input?.pattern || input?.command || input?.query || "";
                  setToolActivity(`Using ${block.name}${detail ? `: ${String(detail).substring(0, 80)}` : ""}`);
                  setThinking(false);
                }
              }
            }
          }
          // Final result text
          if ("result" in msg && typeof msg.result === "string" && msg.result) {
            setStreamingText((prev) => prev + (prev ? "\n\n" : "") + msg.result);
            setToolActivity("");
          }
        }
      }
      if (event.type === "new_question") {
        getQuestions(plan.id).then(setQuestions);
        getPlan(plan.id).then(p => onPlanUpdateRef.current(p));
      }
      if (event.type === "plan_submitted") {
        getPlan(plan.id).then(p => onPlanUpdateRef.current(p));
        getConversation(plan.id).then(setMessages);
      }
      if (event.type === "agent_done") {
        setStreamingText("");
        setThinking(false);
        getPlan(plan.id).then(p => onPlanUpdateRef.current(p));
        getConversation(plan.id).then(setMessages);
        getQuestions(plan.id).then(setQuestions);
      }
      if (event.type === "implementation_done") {
        // Implementation agent finished - refresh and fetch diffs
        setStreamingText("");
        setThinking(false);
        getPlan(plan.id).then(p => onPlanUpdateRef.current(p));
        getConversation(plan.id).then(setMessages);
        if (runIdRef.current) {
          fetchDiffs(runIdRef.current);
        }
      }
      if (event.type === "agent_error") {
        setStreamingText("");
        setThinking(false);
        getPlan(plan.id).then(p => onPlanUpdateRef.current(p));
      }
    });
    return cleanup;
  }, [plan.id]);

  // Auto-scroll
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);
    try {
      await sendChatMessage(plan.id, msg);
      setThinking(true);
      // Optimistic: add user message locally
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          plan_id: plan.id,
          role: "user",
          content: msg,
          metadata: "{}",
          seq: prev.length + 1,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      alert(`Failed to send: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  async function handleAnswer(questionId: string) {
    const answer = answerInputs[questionId]?.trim();
    if (!answer) return;
    try {
      await answerQuestion(plan.id, questionId, answer);
      setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));
      setQuestions((prev) => prev.map((q) =>
        q.id === questionId ? { ...q, answer, answered_at: new Date().toISOString() } : q
      ));
    } catch (err: any) {
      alert(`Failed to answer: ${err.message}`);
    }
  }

  async function handleSubmitForReview() {
    setLoading(true);
    try {
      const updated = await submitPlanForReview(plan.id);
      onPlanUpdate(updated);
    } catch (err: any) {
      alert(`Failed to submit: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setLoading(true);
    try {
      await approvePlan(plan.id);
      onPlanUpdate({ ...plan, status: "APPROVED" });
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    try {
      await rejectPlan(plan.id);
      onPlanUpdate({ ...plan, status: "REJECTED" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestChanges() {
    if (!changeFeedback.trim()) return;
    setLoading(true);
    try {
      const updated = await requestPlanChanges(plan.id, changeFeedback);
      onPlanUpdate(updated);
      setChangeFeedback("");
      setShowChangeFeedback(false);
      getConversation(plan.id).then(setMessages);
    } catch (err: any) {
      alert(`Failed to request changes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    setLoading(true);
    try {
      const result = await startImplementation(plan.id);
      setRunId(result.runId);
      runIdRef.current = result.runId;
      setDiffs([]);
      setPrUrls([]);
      // Optimistically update plan state so Execute button hides immediately
      onPlanUpdate({ ...plan, status: "EXECUTING", agent_phase: "implementing" });
    } catch (err: any) {
      alert(`Failed to start implementation: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePushPR() {
    if (!runId) return;
    setPushingPR(true);
    try {
      const result = await pushAndCreatePR(runId);
      setPrUrls(result.prUrls);
      setPrStatuses(result.prUrls.map((url) => ({ url, status: "OPEN" })));
      getPlan(plan.id).then((p) => onPlanUpdate(p));
    } catch (err: any) {
      alert(`Failed to push & create PR: ${err.message}`);
    } finally {
      setPushingPR(false);
    }
  }

  async function handleCheckMerge() {
    setCheckingMerge(true);
    try {
      const result = await checkPlanMergeStatus(plan.id);
      setPrStatuses(result.pullRequests.map((pr) => ({ url: pr.url, status: pr.status })));
      if (result.allMerged) {
        getPlan(plan.id).then((p) => onPlanUpdate(p));
      }
    } catch (err: any) {
      alert(`Failed to check merge status: ${err.message}`);
    } finally {
      setCheckingMerge(false);
    }
  }

  async function handleRetry() {
    setLoading(true);
    try {
      const updated = await retryPlan(plan.id);
      onPlanUpdate(updated);
    } catch (err: any) {
      alert(`Failed to retry: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDiffs(rid: string, ctx?: number) {
    try {
      const d = await getRunDiff(rid, ctx ?? diffContext);
      setDiffs(d);
    } catch {
      // diff fetch failed silently
    }
  }

  const unansweredQuestions = questions.filter((q) => !q.answer);
  const canChat = plan.agent_phase === "chatting" || plan.agent_phase === "questioning" || plan.agent_phase === "review";
  const isReviewPhase = plan.agent_phase === "review";
  const phaseLabel = PHASE_LABELS[plan.agent_phase ?? "idle"] ?? plan.agent_phase;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${plan.project_id}/plans`} className="text-sm text-indigo-600 hover:underline">
            &larr; Plans
          </Link>
          {plan.task_id && (
            <Link href={`/tasks/${plan.task_id}`} className="text-sm text-gray-500 hover:underline">
              Task
            </Link>
          )}
          <h2 className="text-lg font-semibold">Plan Agent</h2>
          <span className="rounded bg-gray-100 px-2 py-1 text-xs">{plan.status}</span>
          {plan.agent_phase && plan.agent_phase !== "idle" && (
            <span className={`flex items-center gap-1 text-xs ${
              plan.agent_phase === "error" ? "text-red-600" :
              plan.agent_phase === "done" ? "text-green-600" :
              plan.agent_phase === "implementing" ? "text-purple-600" :
              plan.agent_phase === "review" ? "text-indigo-600" :
              "text-blue-600"
            }`}>
              {["analyzing", "planning"].includes(plan.agent_phase) && (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              )}
              {plan.agent_phase === "implementing" && (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-purple-500" />
              )}
              {phaseLabel}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {plan.status === "AWAITING_APPROVAL" && (
            <>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setShowChangeFeedback(!showChangeFeedback)}
                disabled={loading}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Request Changes
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {plan.status === "APPROVED" && (
            <button
              onClick={handleExecute}
              disabled={loading}
              className="rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Execute Plan
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {plan.agent_error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Agent error: {plan.agent_error}
        </div>
      )}

      {/* Change feedback input */}
      {showChangeFeedback && plan.status === "AWAITING_APPROVAL" && (
        <div className="border-b bg-amber-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-amber-700">Describe what changes you&apos;d like:</p>
          <div className="flex gap-2">
            <textarea
              value={changeFeedback}
              onChange={(e) => setChangeFeedback(e.target.value)}
              placeholder="Explain what should be different in the plan..."
              rows={2}
              className="flex-1 rounded border border-amber-200 px-3 py-2 text-sm"
            />
            <button
              onClick={handleRequestChanges}
              disabled={loading || !changeFeedback.trim()}
              className="self-end rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Waiting for answer banner */}
      {plan.agent_phase === "questioning" && unansweredQuestions.length > 0 && (
        <div className="border-b border-orange-300 bg-orange-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500" />
            <p className="text-sm font-semibold text-orange-800">
              Action required: The agent is waiting for your answers
            </p>
          </div>
        </div>
      )}

      {/* Unanswered questions */}
      {unansweredQuestions.length > 0 && (
        <div className="border-b bg-amber-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-amber-700">
            The agent has questions for you:
          </p>
          {unansweredQuestions.map((q) => (
            <div key={q.id} className="mb-2 rounded border border-amber-200 bg-white p-3">
              <p className="mb-1 text-sm font-medium">{q.question}</p>
              {q.context && <p className="mb-2 text-xs text-gray-500">{q.context}</p>}
              <div className="flex gap-2">
                <input
                  value={answerInputs[q.id] ?? ""}
                  onChange={(e) => setAnswerInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Type your answer..."
                  className="flex-1 rounded border px-3 py-1.5 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleAnswer(q.id)}
                />
                <button
                  onClick={() => handleAnswer(q.id)}
                  className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Answer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* Show plan markdown at the top when available */}
          {plan.plan_markdown && plan.plan_markdown.trim() && (
            <div className="rounded-lg border bg-white p-4 text-sm">
              <div className="mb-1 text-xs font-medium text-gray-500">Plan</div>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.plan_markdown}</ReactMarkdown>
              </div>
            </div>
          )}
          {/* Empty state when no messages and no plan content */}
          {messages.length === 0 && !streamingText && !toolActivity && !(plan.plan_markdown && plan.plan_markdown.trim()) && (
            <div className="py-12 text-center text-sm text-gray-400">
              {plan.agent_phase === "implementing" ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-purple-400" />
                  <span>Implementation agent is starting...</span>
                </div>
              ) : plan.agent_phase === "analyzing" ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-blue-400" />
                  <span>Agent is analyzing the codebase...</span>
                </div>
              ) : plan.agent_phase === "error" || plan.status === "FAILED" ? (
                "Execution failed. Use the retry button below to try again."
              ) : (
                "Agent is starting..."
              )}
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {thinking && !streamingText && !toolActivity && (
            <div className="rounded-lg border bg-white p-4 text-sm">
              <div className="mb-1 text-xs font-medium text-gray-500">Assistant</div>
              <div className="flex items-center gap-2 text-gray-400">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" style={{ animationDelay: "0.2s" }} />
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" style={{ animationDelay: "0.4s" }} />
                <span className="text-xs">Thinking...</span>
              </div>
            </div>
          )}
          {(streamingText || toolActivity) && (
            <div className="rounded-lg border bg-white p-4 text-sm">
              <div className="mb-1 text-xs font-medium text-gray-500">Assistant</div>
              {streamingText && (
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                </div>
              )}
              {toolActivity && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                  {toolActivity}
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Diff viewer section */}
      {diffs.length > 0 && (
        <div className="flex-shrink-0 border-t bg-white" style={{ maxHeight: "40vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-sm font-semibold text-gray-700">Implementation Changes</h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Context:</span>
                {[3, 10, 25].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setDiffContext(n); if (runId) fetchDiffs(runId, n); }}
                    className={`rounded px-1.5 py-0.5 ${diffContext === n ? "bg-indigo-100 font-medium text-indigo-700" : "hover:bg-gray-100"}`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => { setDiffContext(9999); if (runId) fetchDiffs(runId, 9999); }}
                  className={`rounded px-1.5 py-0.5 ${diffContext === 9999 ? "bg-indigo-100 font-medium text-indigo-700" : "hover:bg-gray-100"}`}
                >
                  All
                </button>
              </div>
              {isReviewPhase && (
                <button
                  onClick={() => runId && fetchDiffs(runId)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-3">
            <DiffViewer diffs={diffs} />
          </div>
        </div>
      )}

      {/* PR status banner */}
      {prUrls.length > 0 && (
        <div className={`border-t px-4 py-3 ${prStatuses.every((p) => p.status === "MERGED") ? "bg-purple-50" : "bg-green-50"}`}>
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between">
              <p className={`text-sm font-medium ${prStatuses.every((p) => p.status === "MERGED") ? "text-purple-800" : "text-green-800"}`}>
                {prStatuses.every((p) => p.status === "MERGED")
                  ? "All PRs merged! Plan and task completed."
                  : "Pull requests created"}
              </p>
              {!prStatuses.every((p) => p.status === "MERGED") && (
                <button
                  onClick={handleCheckMerge}
                  disabled={checkingMerge}
                  className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {checkingMerge ? "Checking..." : "Check merge status"}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {prStatuses.map((pr) => (
                <a
                  key={pr.url}
                  href={pr.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white ${
                    pr.status === "MERGED" ? "bg-purple-600" : pr.status === "CLOSED" ? "bg-gray-500" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${
                    pr.status === "MERGED" ? "bg-purple-300" : pr.status === "CLOSED" ? "bg-gray-300" : "bg-green-300"
                  }`} />
                  {pr.status === "MERGED" ? "Merged" : pr.status === "CLOSED" ? "Closed" : "Open"} &rarr;
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Implementation in progress bar */}
      {plan.agent_phase === "implementing" && (
        <div className="border-t bg-purple-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-purple-500" />
              <span className="text-sm font-medium text-purple-800">Implementation in progress...</span>
            </div>
            {toolActivity && (
              <span className="truncate text-xs text-purple-600">{toolActivity}</span>
            )}
          </div>
          <div className="mx-auto mt-2 max-w-3xl">
            <div className="h-1 overflow-hidden rounded-full bg-purple-200">
              <div className="h-full w-1/3 animate-[shimmer_2s_ease-in-out_infinite] rounded-full bg-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Failed - retry bar */}
      {plan.status === "FAILED" && (
        <div className="border-t bg-red-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-red-800">Plan execution failed</span>
              {plan.agent_error && (
                <span className="text-xs text-red-600">{plan.agent_error}</span>
              )}
            </div>
            <button
              onClick={handleRetry}
              disabled={loading}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Retry Execution
            </button>
          </div>
        </div>
      )}

      {/* Submit for review bar (when plan is DRAFT and agent has finished) */}
      {plan.status === "DRAFT" && (plan.agent_phase === "chatting" || plan.agent_phase === "done") && (
        <div className="border-t bg-amber-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="text-sm font-medium text-amber-800">Plan generated. Submit it for review to approve and execute.</span>
            <button
              onClick={handleSubmitForReview}
              disabled={loading}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Submit for Review
            </button>
          </div>
        </div>
      )}

      {/* Approval bar */}
      {plan.status === "AWAITING_APPROVAL" && (
        <div className="border-t bg-green-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="text-sm font-medium text-green-800">Plan ready for review</span>
            <div className="flex gap-2">
              <button
                onClick={handleReject}
                disabled={loading}
                className="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Approve Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute bar */}
      {plan.status === "APPROVED" && (
        <div className="border-t bg-purple-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="text-sm font-medium text-purple-800">Plan approved</span>
            <button
              onClick={handleExecute}
              disabled={loading}
              className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              Execute Plan
            </button>
          </div>
        </div>
      )}

      {/* Push & Create PR bar */}
      {isReviewPhase && diffs.length > 0 && prUrls.length === 0 && (
        <div className="border-t bg-indigo-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <span className="text-sm font-medium text-indigo-800">
              Review the changes above, chat with the agent to iterate, or push when ready
            </span>
            <button
              onClick={handlePushPR}
              disabled={pushingPR}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {pushingPR ? "Pushing..." : "Push & Create PR"}
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {canChat && (
        <form onSubmit={handleSend} className="border-t bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isReviewPhase ? "Request changes to the implementation..." : "Send a message to the agent..."}
              disabled={sending}
              className="flex-1 rounded border px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
