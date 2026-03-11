import type { PlanConversation } from "../../types/entities.js";

export interface CreateConversationMessageData {
  plan_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: string;
}

export interface IPlanConversationRepo {
  append(data: CreateConversationMessageData): PlanConversation;
  listByPlan(planId: string): PlanConversation[];
  deleteByPlan(planId: string): void;
}
