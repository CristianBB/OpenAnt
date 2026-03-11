import { getDb } from "../../db/database.js";
import { newId } from "../../lib/id.js";
import type { PlanConversation } from "../../types/entities.js";
import type { IPlanConversationRepo, CreateConversationMessageData } from "../interfaces/plan-conversation-repo.js";

export class SqlitePlanConversationRepo implements IPlanConversationRepo {
  append(data: CreateConversationMessageData): PlanConversation {
    const db = getDb();
    const id = newId();
    const seq = (db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM plan_conversations WHERE plan_id = ?").get(data.plan_id) as { next_seq: number }).next_seq;

    db.prepare(
      `INSERT INTO plan_conversations (id, plan_id, role, content, metadata, seq)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.plan_id, data.role, data.content, data.metadata ?? "{}", seq);

    return db.prepare("SELECT * FROM plan_conversations WHERE id = ?").get(id) as PlanConversation;
  }

  listByPlan(planId: string): PlanConversation[] {
    return getDb().prepare("SELECT * FROM plan_conversations WHERE plan_id = ? ORDER BY seq ASC").all(planId) as PlanConversation[];
  }

  deleteByPlan(planId: string): void {
    getDb().prepare("DELETE FROM plan_conversations WHERE plan_id = ?").run(planId);
  }
}
