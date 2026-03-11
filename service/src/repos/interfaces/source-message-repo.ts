import type { SourceMessage } from "../../types/entities.js";
import type { TriageClassification } from "../../types/enums.js";

export interface CreateSourceMessageData {
  channel_id: string;
  project_id: string;
  external_id: string;
  content: string;
  subject?: string;
  sender_name?: string;
  sender_email?: string;
  sender_id?: string;
  raw_json?: string;
  received_at?: string;
}

export interface ISourceMessageRepo {
  create(data: CreateSourceMessageData): SourceMessage;
  findById(id: string): SourceMessage | undefined;
  findByChannelAndExternalId(channelId: string, externalId: string): SourceMessage | undefined;
  listPendingByProject(projectId: string, limit?: number): SourceMessage[];
  markProcessing(ids: string[]): void;
  markTriaged(id: string, classification: TriageClassification): void;
  markDismissed(id: string): void;
  markError(id: string, error?: string): void;
  markPending(id: string): void;
  listByChannel(channelId: string, opts?: { limit?: number; offset?: number }): SourceMessage[];
  countByChannel(channelId: string): number;
  countPendingByChannel(channelId: string): number;
  countPendingByProject(projectId: string): number;
  listProjectsWithPending(): string[];
}
