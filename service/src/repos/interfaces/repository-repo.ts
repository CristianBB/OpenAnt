import type { Repository } from "../../types/entities.js";

export interface CreateRepositoryData {
  project_id: string;
  owner: string;
  name: string;
  default_branch?: string;
  github_repo_id?: number;
}

export interface IRepositoryRepo {
  create(data: CreateRepositoryData): Repository;
  findById(id: string): Repository | null;
  findByProjectAndFullName(projectId: string, owner: string, name: string): Repository | null;
  listByProject(projectId: string): Repository[];
  listSelectedByProject(projectId: string): Repository[];
  setSelected(id: string, selected: boolean): void;
  updateDefaultBranch(id: string, branch: string): void;
  updateAnalysis(id: string, analysisJson: string): void;
  updateAnalysisStatus(id: string, status: string, error?: string | null): void;
  delete(id: string): void;
}
