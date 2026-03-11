export interface ITaskSourceMessageRepo {
  link(taskId: string, sourceMessageId: string): void;
  listByTask(taskId: string): { task_id: string; source_message_id: string }[];
  countByTask(taskId: string): number;
}
