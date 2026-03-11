import { getRepos } from "../repos/sqlite/index.js";
import { getLLMProvider } from "../llm/index.js";
import { runTriageAgent, type TriageDecision } from "./triage-agent.js";
import { getLogger } from "../lib/logger.js";

const BATCH_SIZE = 20;

export async function processTriageBatch(projectId: string): Promise<void> {
  const log = getLogger();
  const repos = getRepos();

  const pendingMessages = repos.sourceMessages.listPendingByProject(projectId, BATCH_SIZE);
  if (pendingMessages.length === 0) return;

  log.info({ projectId, messageCount: pendingMessages.length }, "Processing triage batch");

  // Mark as processing
  const ids = pendingMessages.map((m) => m.id);
  repos.sourceMessages.markProcessing(ids);

  try {
    const project = repos.projects.findById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const { provider, config } = getLLMProvider(projectId);

    // Gather existing tasks for context
    const existingTasks = repos.tasks.listByProject(projectId, {})
      .filter((t) => t.status === "PENDING_REVIEW" || t.status === "OPEN" || t.status === "PLANNED" || t.status === "IN_PROGRESS")
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        requester_count: t.requester_count ?? 1,
        status: t.status,
      }));

    // Build channel cache (id → channel object)
    const channelCache = new Map<string, { kind: string; name: string }>();
    function getChannel(channelId: string) {
      let cached = channelCache.get(channelId);
      if (!cached) {
        const ch = repos.channels.findById(channelId);
        cached = { kind: ch?.kind ?? "UNKNOWN", name: ch?.name ?? "Unknown" };
        channelCache.set(channelId, cached);
      }
      return cached;
    }

    // Parse source repo from GitHub Issues external_id (e.g. "issue:owner/repo#123")
    function parseSourceRepo(externalId: string): string | null {
      const match = externalId.match(/^(?:issue|comment):(.+?)#/);
      return match ? match[1] : null;
    }

    const messagesForAgent = pendingMessages.map((m) => {
      const ch = getChannel(m.channel_id);
      return {
        id: m.id,
        content: m.content,
        subject: m.subject,
        sender_name: m.sender_name,
        channel_kind: ch.kind,
        channel_name: ch.name,
        source_repo: parseSourceRepo(m.external_id),
      };
    });

    // Gather project repositories with analysis summaries
    const projectRepos = repos.repositories.listByProject(projectId).map((r) => ({
      id: r.id,
      owner: r.owner,
      name: r.name,
      analysis_summary: r.analysis_json,
    }));

    const result = await runTriageAgent(provider, config.assignmentModel, {
      messages: messagesForAgent,
      existingTasks,
      repositories: projectRepos,
      projectRules: project.rules_nl ?? "",
    });

    // Process decisions
    const taskGroups = new Map<string, { title: string; description: string; messageIds: string[]; classification: string; affectedRepoIds: string[] }>();

    for (const decision of result.decisions) {
      log.info(
        { messageId: decision.source_message_id, action: decision.action, classification: decision.classification, confidence: decision.confidence, reason: decision.reason },
        "Triage decision"
      );
      try {
        processDecision(projectId, decision, taskGroups);
      } catch (err: any) {
        log.error({ messageId: decision.source_message_id, err: err.message }, "Failed to process triage decision");
        repos.sourceMessages.markError(decision.source_message_id, err.message);
      }
    }

    // Create tasks for grouped new task requests
    for (const [groupKey, group] of taskGroups) {
      const task = repos.tasks.create({
        project_id: projectId,
        title: group.title,
        description: group.description,
        status: "PENDING_REVIEW",
      });

      // Update requester count
      if (group.messageIds.length > 1) {
        repos.tasks.update(task.id, { requester_count: group.messageIds.length });
      }

      // Link all messages in the group
      for (const msgId of group.messageIds) {
        repos.taskSourceMessages.link(task.id, msgId);
        repos.sourceMessages.markTriaged(msgId, group.classification as any);
      }

      // Create repo impacts
      for (const repoId of group.affectedRepoIds) {
        repos.taskRepoImpacts.create({
          task_id: task.id,
          repository_id: repoId,
          areas_json: "[]",
          confidence: 1,
          reason: "Identified by triage agent",
        });
      }

      log.info({ taskId: task.id, groupKey, messageCount: group.messageIds.length, repoCount: group.affectedRepoIds.length }, "Created task from triage");
    }
  } catch (err: any) {
    log.error({ projectId, err: err.message }, "Triage batch failed");
    // Mark all as error so they get retried
    for (const id of ids) {
      repos.sourceMessages.markError(id, err.message);
    }
  }
}

function processDecision(
  projectId: string,
  decision: TriageDecision,
  taskGroups: Map<string, { title: string; description: string; messageIds: string[]; classification: string; affectedRepoIds: string[] }>,
): void {
  const repos = getRepos();

  switch (decision.action) {
    case "DISMISS": {
      repos.sourceMessages.markDismissed(decision.source_message_id);
      break;
    }

    case "LINK_TO_EXISTING": {
      if (!decision.existing_task_id) {
        repos.sourceMessages.markError(decision.source_message_id, "No existing_task_id provided");
        return;
      }

      const task = repos.tasks.findById(decision.existing_task_id);
      if (!task) {
        repos.sourceMessages.markError(decision.source_message_id, `Task ${decision.existing_task_id} not found`);
        return;
      }

      repos.taskSourceMessages.link(task.id, decision.source_message_id);
      repos.tasks.update(task.id, { requester_count: (task.requester_count ?? 1) + 1 });
      repos.sourceMessages.markTriaged(decision.source_message_id, decision.classification as any);
      break;
    }

    case "CREATE_TASK": {
      const groupKey = decision.new_task_group ?? decision.source_message_id;
      const existing = taskGroups.get(groupKey);
      const repoIds = decision.affected_repository_ids ?? [];

      if (existing) {
        existing.messageIds.push(decision.source_message_id);
        // Merge repo IDs without duplicates
        for (const rid of repoIds) {
          if (!existing.affectedRepoIds.includes(rid)) {
            existing.affectedRepoIds.push(rid);
          }
        }
      } else {
        taskGroups.set(groupKey, {
          title: decision.new_task_title ?? "Untitled task",
          description: decision.new_task_description ?? "",
          messageIds: [decision.source_message_id],
          classification: decision.classification,
          affectedRepoIds: repoIds,
        });
      }
      break;
    }
  }
}
