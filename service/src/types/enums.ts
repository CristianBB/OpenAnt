export type TaskStatus =
  | "PENDING_REVIEW"
  | "OPEN"
  | "PLANNED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "WONTFIX";

export type PlanStatus =
  | "GENERATING"
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "DONE"
  | "FAILED"
  | "ARCHIVED";

export type RunStatus = "QUEUED" | "RUNNING" | "REVIEW" | "FAILED" | "DONE";

export type IntegrationKind =
  | "OPENROUTER"
  | "GITHUB"
  | "ANTHROPIC"
  | "GMAIL"
  | "SLACK";

export type ChannelKind = "GMAIL" | "SLACK" | "GITHUB_ISSUES";

export type TriageStatus =
  | "PENDING"
  | "PROCESSING"
  | "TRIAGED"
  | "DISMISSED"
  | "ERROR";

export type TriageClassification =
  | "BUG"
  | "FEATURE_REQUEST"
  | "IMPROVEMENT"
  | "IRRELEVANT";

export type AgentPhase =
  | "idle"
  | "analyzing"
  | "questioning"
  | "planning"
  | "chatting"
  | "implementing"
  | "review"
  | "done"
  | "error";

export type TaskLinkType =
  | "DUPLICATES"
  | "RELATED"
  | "DEPENDS_ON"
  | "BLOCKS"
  | "SAME_EPIC";

export type AnalysisStatus = "IDLE" | "ANALYZING" | "DONE" | "ERROR";

export type PullRequestStatus = "OPEN" | "MERGED" | "CLOSED";

export type WorkGroupStatus = "OPEN" | "DONE";
