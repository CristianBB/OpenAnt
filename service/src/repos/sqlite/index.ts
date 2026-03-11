import { SqliteProjectRepo } from "./project-repo.js";
import { SqliteIntegrationSettingsRepo } from "./integration-settings-repo.js";
import { SqliteRepositoryRepo } from "./repository-repo.js";
import { SqliteTaskRepo } from "./task-repo.js";
import { SqliteWorkGroupRepo } from "./work-group-repo.js";
import { SqlitePlanRepo } from "./plan-repo.js";
import { SqliteRunRepo } from "./run-repo.js";
import { SqlitePullRequestRepo } from "./pull-request-repo.js";
import { SqliteTaskLinkRepo } from "./task-link-repo.js";
import { SqliteTaskRepoImpactRepo } from "./task-repo-impact-repo.js";
import { SqlitePlanConversationRepo } from "./plan-conversation-repo.js";
import { SqlitePlanQuestionRepo } from "./plan-question-repo.js";
import { SqliteCodeIndexRepo } from "./code-index-repo.js";
import { SqliteChannelRepo } from "./channel-repo.js";
import { SqliteSourceMessageRepo } from "./source-message-repo.js";
import { SqliteTaskSourceMessageRepo } from "./task-source-message-repo.js";
import type {
  IProjectRepo, IIntegrationSettingsRepo,
  IRepositoryRepo, ITaskRepo, IWorkGroupRepo, IPlanRepo, IRunRepo,
  IPullRequestRepo, ITaskLinkRepo, ITaskRepoImpactRepo,
  IPlanConversationRepo, IPlanQuestionRepo, ICodeIndexRepo,
  IChannelRepo, ISourceMessageRepo, ITaskSourceMessageRepo,
} from "../interfaces/index.js";

export interface Repos {
  projects: IProjectRepo;
  integrationSettings: IIntegrationSettingsRepo;
  repositories: IRepositoryRepo;
  tasks: ITaskRepo;
  workGroups: IWorkGroupRepo;
  plans: IPlanRepo;
  runs: IRunRepo;
  pullRequests: IPullRequestRepo;
  taskLinks: ITaskLinkRepo;
  taskRepoImpacts: ITaskRepoImpactRepo;
  planConversations: IPlanConversationRepo;
  planQuestions: IPlanQuestionRepo;
  codeIndex: ICodeIndexRepo;
  channels: IChannelRepo;
  sourceMessages: ISourceMessageRepo;
  taskSourceMessages: ITaskSourceMessageRepo;
}

let repos: Repos | null = null;

export function getRepos(): Repos {
  if (!repos) {
    repos = {
      projects: new SqliteProjectRepo(),
      integrationSettings: new SqliteIntegrationSettingsRepo(),
      repositories: new SqliteRepositoryRepo(),
      tasks: new SqliteTaskRepo(),
      workGroups: new SqliteWorkGroupRepo(),
      plans: new SqlitePlanRepo(),
      runs: new SqliteRunRepo(),
      pullRequests: new SqlitePullRequestRepo(),
      taskLinks: new SqliteTaskLinkRepo(),
      taskRepoImpacts: new SqliteTaskRepoImpactRepo(),
      planConversations: new SqlitePlanConversationRepo(),
      planQuestions: new SqlitePlanQuestionRepo(),
      codeIndex: new SqliteCodeIndexRepo(),
      channels: new SqliteChannelRepo(),
      sourceMessages: new SqliteSourceMessageRepo(),
      taskSourceMessages: new SqliteTaskSourceMessageRepo(),
    };
  }
  return repos;
}
