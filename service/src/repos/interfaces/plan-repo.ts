import type { Plan } from "../../types/entities.js";
import type { PlanStatus, AgentPhase } from "../../types/enums.js";

export interface CreatePlanData {
  project_id: string;
  task_id?: string;
  work_group_id?: string;
  plan_markdown: string;
  plan_json: string;
  status?: PlanStatus;
  agent_phase?: AgentPhase;
}

export type UpdatePlanData = Partial<Pick<Plan, "plan_markdown" | "plan_json" | "status" | "agent_phase" | "agent_session_id" | "agent_error" | "workspace_path" | "branch_name">>;

export interface IPlanRepo {
  create(data: CreatePlanData): Plan;
  findById(id: string): Plan | null;
  listByProject(projectId: string): Plan[];
  listByTask(taskId: string): Plan[];
  updateStatus(id: string, status: PlanStatus): void;
  update(id: string, data: UpdatePlanData): Plan | null;
  delete(id: string): void;
}
