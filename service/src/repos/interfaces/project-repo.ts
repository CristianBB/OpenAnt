import type { Project } from "../../types/entities.js";

export interface CreateProjectData {
  name: string;
  description?: string;
  rules_nl?: string;
  agent_policy_nl?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  rules_nl?: string;
  agent_policy_nl?: string;
  max_parallel_runs?: number;
}

export interface IProjectRepo {
  create(data: CreateProjectData): Project;
  findById(id: string): Project | null;
  list(): Project[];
  update(id: string, data: UpdateProjectData): Project | null;
  delete(id: string): void;
}
