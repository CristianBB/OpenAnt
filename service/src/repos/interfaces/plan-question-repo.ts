import type { PlanQuestion } from "../../types/entities.js";

export interface CreatePlanQuestionData {
  plan_id: string;
  question: string;
  context?: string;
}

export interface IPlanQuestionRepo {
  create(data: CreatePlanQuestionData): PlanQuestion;
  findById(id: string): PlanQuestion | null;
  listByPlan(planId: string): PlanQuestion[];
  listUnanswered(planId: string): PlanQuestion[];
  answer(id: string, answer: string): void;
}
