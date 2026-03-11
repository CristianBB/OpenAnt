export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  user_context: string;
  status: string;
  priority: number;
  origin_external_id: string | null;
  requester_count: number;
  approval_instructions: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkGroup {
  id: string;
  project_id: string;
  name: string;
  summary: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  project_id: string;
  task_id: string | null;
  work_group_id: string | null;
  plan_markdown: string;
  plan_json: string;
  status: string;
  agent_phase: string | null;
  agent_session_id: string | null;
  agent_error: string | null;
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

export interface Run {
  id: string;
  plan_id: string;
  status: string;
  logs_path: string | null;
  workspace_path: string | null;
  branch_name: string | null;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export type ChannelKind = "GMAIL" | "SLACK" | "GITHUB_ISSUES";

export interface Channel {
  id: string;
  project_id: string;
  kind: ChannelKind;
  name: string;
  enabled: boolean;
  last_poll_at: string | null;
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
  triage_status: string;
  triage_classification: string | null;
  received_at: string;
  created_at: string;
}
