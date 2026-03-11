import type { Channel } from "../../types/entities.js";
import type { ChannelKind } from "../../types/enums.js";

export interface CreateChannelData {
  project_id: string;
  kind: ChannelKind;
  name: string;
  config_encrypted: string;
  enabled?: number;
}

export interface IChannelRepo {
  create(data: CreateChannelData): Channel;
  findById(id: string): Channel | undefined;
  listByProject(projectId: string): Channel[];
  listEnabled(): Channel[];
  listEnabledByKind(kind: ChannelKind): Channel[];
  updatePollCursor(id: string, cursor: string, pollAt: string): void;
  updateEnabled(id: string, enabled: boolean): void;
  update(id: string, data: Partial<{ name: string; config_encrypted: string; enabled: number }>): void;
  delete(id: string): void;
}
