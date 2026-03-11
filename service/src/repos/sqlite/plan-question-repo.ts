import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { PlanQuestion } from "../../types/entities.js";
import type { IPlanQuestionRepo, CreatePlanQuestionData } from "../interfaces/plan-question-repo.js";

export class SqlitePlanQuestionRepo implements IPlanQuestionRepo {
  create(data: CreatePlanQuestionData): PlanQuestion {
    const db = getDb();
    const id = newId();
    db.prepare(
      `INSERT INTO plan_questions (id, plan_id, question, context)
       VALUES (?, ?, ?, ?)`
    ).run(id, data.plan_id, data.question, data.context ?? "");
    return db.prepare("SELECT * FROM plan_questions WHERE id = ?").get(id) as PlanQuestion;
  }

  findById(id: string): PlanQuestion | null {
    return (getDb().prepare("SELECT * FROM plan_questions WHERE id = ?").get(id) as PlanQuestion) ?? null;
  }

  listByPlan(planId: string): PlanQuestion[] {
    return getDb().prepare("SELECT * FROM plan_questions WHERE plan_id = ? ORDER BY created_at ASC").all(planId) as PlanQuestion[];
  }

  listUnanswered(planId: string): PlanQuestion[] {
    return getDb().prepare("SELECT * FROM plan_questions WHERE plan_id = ? AND answer IS NULL ORDER BY created_at ASC").all(planId) as PlanQuestion[];
  }

  answer(id: string, answer: string): void {
    getDb().prepare("UPDATE plan_questions SET answer = ?, answered_at = datetime('now') WHERE id = ?").run(answer, id);
  }
}
