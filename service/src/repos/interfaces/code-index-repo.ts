import type { CodeIndexFile } from "../../types/entities.js";

export interface UpsertCodeIndexData {
  repository_id: string;
  file_path: string;
  file_hash: string;
  language?: string;
  size_bytes: number;
}

export interface ICodeIndexRepo {
  upsert(data: UpsertCodeIndexData): CodeIndexFile;
  findByRepoAndPath(repositoryId: string, filePath: string): CodeIndexFile | null;
  listByRepo(repositoryId: string): CodeIndexFile[];
  deleteByRepoAndPath(repositoryId: string, filePath: string): void;
  deleteByRepo(repositoryId: string): void;
}
