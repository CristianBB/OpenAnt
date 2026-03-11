"use client";

import type { PlanConversation } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  message: PlanConversation;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const metadata = (() => {
    try { return JSON.parse(message.metadata); } catch { return {}; }
  })();

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? "bg-indigo-600 text-white"
            : isSystem
            ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
            : "bg-white border border-gray-200 text-gray-800"
        }`}
      >
        {metadata.type === "question" && (
          <div className="mb-1 text-xs font-medium text-indigo-600">
            Agent Question
          </div>
        )}
        {metadata.type === "plan" && (
          <div className="mb-1 text-xs font-medium text-green-600">
            Plan Submitted
          </div>
        )}
        {metadata.type === "implementation" && (
          <div className="mb-1 text-xs font-medium text-purple-600">
            Implementation
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
        <div className={`mt-1 text-[10px] ${isUser ? "text-indigo-200" : "text-gray-400"}`}>
          {new Date(message.created_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
