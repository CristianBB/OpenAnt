import type {
  TaskStatus,
  PlanStatus,
  RunStatus,
  IntegrationKind,
  ChannelKind,
  TriageStatus,
  TriageClassification,
  TaskLinkType,
  PullRequestStatus,
  WorkGroupStatus,
  AgentPhase,
  AnalysisStatus,
} from "./enums.js";

export interface Project {
  id: string;
  name: string;
  description: string;
  rules_nl: string;
  agent_policy_nl: string;
  max_parallel_runs: number;
  created_at: string;
  updated_at: string;
}

export interface IntegrationSettings {
  id: string;
  project_id: string;
  kind: IntegrationKind;
  json_encrypted: string;
  updated_at: string;
}

export interface Repository {
  id: string;
  project_id: string;
  provider: string;
  owner: string;
  name: string;
  default_branch: string;
  github_repo_id: number | null;
  selected: number;
  analysis_json: string | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  last_analyzed_at: string | null;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  user_context: string;
  status: TaskStatus;
  priority: number;
  origin_external_id: string | null;
  requester_count: number;
  approval_instructions: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  project_id: string;
  kind: ChannelKind;
  name: string;
  config_encrypted: string;
  enabled: number;
  last_poll_at: string | null;
  last_poll_cursor: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceMessage {
  id: string;
  channel_id: string;
  project_id: string;
  external_id: string;
  content: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  sender_id: string | null;
  raw_json: string | null;
  triage_status: TriageStatus;
  triage_classification: TriageClassification | null;
  received_at: string;
  triaged_at: string | null;
  created_at: string;
}

export interface TaskSourceMessage {
  id: string;
  task_id: string;
  source_message_id: string;
  created_at: string;
}

export interface WorkGroup {
  id: string;
  project_id: string;
  name: string;
  summary: string;
  status: WorkGroupStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkGroupItem {
  id: string;
  work_group_id: string;
  task_id: string;
  confidence: number;
  reason: string;
}

export interface TaskLink {
  id: string;
  project_id: string;
  from_task_id: string;
  to_task_id: string;
  type: TaskLinkType;
  confidence: number;
  reason: string;
}

export interface TaskRepoImpact {
  id: string;
  task_id: string;
  repository_id: string;
  areas_json: string;
  confidence: number;
  reason: string;
}

export interface Plan {
  id: string;
  project_id: string;
  task_id: string | null;
  work_group_id: string | null;
  plan_markdown: string;
  plan_json: string;
  status: PlanStatus;
  agent_phase: AgentPhase;
  agent_session_id: string | null;
  agent_error: string | null;
  workspace_path: string | null;
  branch_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanConversation {
  id: string;
  plan_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: string;
  seq: number;
  created_at: string;
}

export interface PlanQuestion {
  id: string;
  plan_id: string;
  question: string;
  context: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface CodeIndexFile {
  id: string;
  repository_id: string;
  file_path: string;
  file_hash: string;
  language: string | null;
  size_bytes: number;
  indexed_at: string;
}

export interface Run {
  id: string;
  plan_id: string;
  status: RunStatus;
  logs_path: string | null;
  error: string | null;
  workspace_path: string | null;
  branch_name: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface PullRequest {
  id: string;
  plan_id: string;
  repository_id: string;
  provider: string;
  github_pr_number: number | null;
  url: string | null;
  status: PullRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface JobLock {
  job_name: string;
  locked_at: string;
  lock_ttl_sec: number;
  locked_by: string;
}
