import type { IntegrationSettings } from "../../types/entities.js";
import type { IntegrationKind } from "../../types/enums.js";

export interface IIntegrationSettingsRepo {
  upsert(projectId: string, kind: IntegrationKind, jsonEncrypted: string): IntegrationSettings;
  findByProjectAndKind(projectId: string, kind: IntegrationKind): IntegrationSettings | null;
  delete(projectId: string, kind: IntegrationKind): void;
  listByProject(projectId: string): IntegrationSettings[];
}
