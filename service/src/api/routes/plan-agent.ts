import type { FastifyInstance } from "fastify";
import { getRepos } from "../../repos/sqlite/index.js";
import { getAnthropicConfig } from "../../llm/anthropic-config.js";
import { getOAuthToken } from "../../github/oauth.js";
import { planAgentEmitter, startPlanAgent, resumePlanAgent, startImplementationAgent, resumeImplementationAgent } from "../../agents/plan-agent/agent-loop.js";
import { createPlanWorkspace } from "../../lib/workspace-manager.js";
import { simpleGit } from "simple-git";
import { createPullRequest } from "../../runner/pr-creator.js";
import { generatePrDescription } from "../../agents/pr-description.js";
import { GitHubClient } from "../../github/github-client.js";
import path from "node:path";
import fs from "node:fs";

export async function planAgentRoutes(app: FastifyInstance): Promise<void> {
  // Start agent-based plan generation for a task
  app.post<{ Params: { taskId: string } }>("/api/tasks/:taskId/plans/agent", async (request, reply) => {
    const repos = getRepos();
    const task = repos.tasks.findById(request.params.taskId);
    if (!task) {
      reply.code(404).send({ error: "Task not found" });
      return;
    }

    const project = repos.projects.findById(task.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const anthropicConfig = getAnthropicConfig(project.id);
    if (!anthropicConfig) {
      reply.code(400).send({ error: "Anthropic API key not configured. Go to Integrations to set it up." });
      return;
    }

    // Return existing plan if one already exists for this task (avoid duplicates)
    const existingPlans = repos.plans.listByTask(task.id);
    const activePlan = existingPlans.find((p) => p.status !== "FAILED");
    if (activePlan) {
      reply.code(200).send(activePlan);
      return;
    }

    // Create plan in DB first (need plan.id for workspace path)
    const plan = repos.plans.create({
      project_id: project.id,
      task_id: task.id,
      plan_markdown: "",
      plan_json: "{}",
      status: "DRAFT",
      agent_phase: "analyzing",
    });

    // Create workspace from local repo copies
    const selectedRepos = repos.repositories.listSelectedByProject(project.id);
    const { workspacePath, branchName } = await createPlanWorkspace({
      planId: plan.id,
      projectId: project.id,
      repos: selectedRepos,
    });
    repos.plans.update(plan.id, { workspace_path: workspacePath, branch_name: branchName });

    // Build prompt with optional user context
    const userContextBlock = task.user_context
      ? `\n\n**Additional context:**\n${task.user_context}`
      : "";

    // Save initial user message to conversation
    repos.planConversations.append({
      plan_id: plan.id,
      role: "user",
      content: `Generate an implementation plan for:\n\n**${task.title}**\n\n${task.description}${userContextBlock}`,
    });

    // Fire and forget - agent runs in background
    startPlanAgent({
      planId: plan.id,
      projectId: project.id,
      taskTitle: task.title,
      taskDescription: `${task.description}${userContextBlock}`,
      workspacePath,
    }).catch((err) => {
      app.log.error({ planId: plan.id, err }, "Plan agent failed");
    });

    reply.code(201).send(plan);
  });

  // Start agent-based plan generation for a work group
  app.post<{ Params: { groupId: string } }>("/api/work-groups/:groupId/plans/agent", async (request, reply) => {
    const repos = getRepos();
    const group = repos.workGroups.findById(request.params.groupId);
    if (!group) {
      reply.code(404).send({ error: "Work group not found" });
      return;
    }

    const project = repos.projects.findById(group.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const anthropicConfig = getAnthropicConfig(project.id);
    if (!anthropicConfig) {
      reply.code(400).send({ error: "Anthropic API key not configured" });
      return;
    }

    const items = repos.workGroups.listItems(group.id);
    const tasks = items.map((item) => repos.tasks.findById(item.task_id)).filter(Boolean);
    const taskSummary = tasks.map((t) => `- **${t!.title}**: ${t!.description}`).join("\n");

    // Create plan in DB first (need plan.id for workspace path)
    const plan = repos.plans.create({
      project_id: project.id,
      work_group_id: group.id,
      plan_markdown: "",
      plan_json: "{}",
      status: "DRAFT",
      agent_phase: "analyzing",
    });

    // Create workspace from local repo copies
    const selectedRepos = repos.repositories.listSelectedByProject(project.id);
    const { workspacePath, branchName } = await createPlanWorkspace({
      planId: plan.id,
      projectId: project.id,
      repos: selectedRepos,
    });
    repos.plans.update(plan.id, { workspace_path: workspacePath, branch_name: branchName });

    repos.planConversations.append({
      plan_id: plan.id,
      role: "user",
      content: `Generate an implementation plan for work group "${group.name}":\n\n${group.summary}\n\nTasks:\n${taskSummary}`,
    });

    startPlanAgent({
      planId: plan.id,
      projectId: project.id,
      taskTitle: group.name,
      taskDescription: `${group.summary}\n\nTasks:\n${taskSummary}`,
      workspacePath,
    }).catch((err) => {
      app.log.error({ planId: plan.id, err }, "Plan agent failed");
    });

    reply.code(201).send(plan);
  });

  // SSE stream for plan agent events
  app.get<{ Params: { planId: string } }>("/api/plans/:planId/stream", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    const origin = request.headers.origin || "";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });

    // Send current plan state
    reply.raw.write(`data: ${JSON.stringify({ type: "plan_state", plan })}\n\n`);

    const eventKey = `plan:${plan.id}`;
    const handler = (event: unknown) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // client disconnected
      }
    };

    planAgentEmitter.on(eventKey, handler);

    request.raw.on("close", () => {
      planAgentEmitter.off(eventKey, handler);
    });
  });

  // Get conversation history
  app.get<{ Params: { planId: string } }>("/api/plans/:planId/conversation", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    return repos.planConversations.listByPlan(plan.id);
  });

  // Send a chat message to the agent
  app.post<{ Params: { planId: string } }>("/api/plans/:planId/chat", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    if (plan.agent_phase !== "chatting" && plan.agent_phase !== "questioning" && plan.agent_phase !== "review") {
      reply.code(400).send({ error: `Cannot chat in phase: ${plan.agent_phase}` });
      return;
    }

    const { message } = request.body as { message: string };
    if (!message?.trim()) {
      reply.code(400).send({ error: "Message is required" });
      return;
    }

    // Use implementation agent if in review phase (has workspace context)
    if (plan.agent_phase === "review") {
      // Prefer plan workspace; fall back to run workspace for backward compatibility
      const workspacePath = plan.workspace_path
        ?? repos.runs.listByPlan(plan.id).find(r => r.workspace_path)?.workspace_path;
      if (workspacePath) {
        resumeImplementationAgent(plan.id, message, workspacePath).catch((err) => {
          app.log.error({ planId: plan.id, err }, "Resume implementation agent failed");
        });
      } else {
        reply.code(400).send({ error: "No workspace found for implementation review" });
        return;
      }
    } else {
      // Fire and forget - agent processes the message in background
      resumePlanAgent(plan.id, message).catch((err) => {
        app.log.error({ planId: plan.id, err }, "Resume plan agent failed");
      });
    }

    return { ok: true };
  });

  // Get agent questions for a plan
  app.get<{ Params: { planId: string } }>("/api/plans/:planId/questions", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    return repos.planQuestions.listByPlan(plan.id);
  });

  // Answer an agent question
  app.post<{ Params: { planId: string; questionId: string } }>("/api/plans/:planId/questions/:questionId/answer", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    const question = repos.planQuestions.findById(request.params.questionId);
    if (!question || question.plan_id !== plan.id) {
      reply.code(404).send({ error: "Question not found" });
      return;
    }

    const { answer } = request.body as { answer: string };
    if (!answer?.trim()) {
      reply.code(400).send({ error: "Answer is required" });
      return;
    }

    repos.planQuestions.answer(question.id, answer);

    // Resume agent with the answer
    resumePlanAgent(plan.id, `Answer to your question "${question.question}": ${answer}`).catch((err) => {
      app.log.error({ planId: plan.id, err }, "Resume plan agent after answer failed");
    });

    return { ok: true };
  });

  // Start implementation phase (after plan approval)
  app.post<{ Params: { planId: string } }>("/api/plans/:planId/implement", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    if (plan.status !== "APPROVED") {
      reply.code(400).send({ error: "Plan must be approved before implementation" });
      return;
    }

    const project = repos.projects.findById(plan.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const token = getOAuthToken(project.id);
    if (!token) {
      reply.code(400).send({ error: "GitHub not connected" });
      return;
    }

    // Resolve plan content — plan_markdown may be empty if agent didn't call submit_plan
    let planMarkdown = plan.plan_markdown?.trim() || "";
    if (!planMarkdown) {
      const conversations = repos.planConversations.listByPlan(plan.id);
      // Look for the explicit plan submission message first
      const planMsg = conversations.find(m => {
        try { return JSON.parse(m.metadata).type === "plan"; } catch { return false; }
      });
      if (planMsg) {
        planMarkdown = planMsg.content;
      } else {
        // Fall back to the last substantial assistant message
        const assistantMsgs = conversations.filter(m => m.role === "assistant" && m.content.length > 100);
        if (assistantMsgs.length > 0) {
          planMarkdown = assistantMsgs[assistantMsgs.length - 1].content;
        }
      }
    }

    if (!planMarkdown) {
      reply.code(400).send({ error: "No plan content found. The plan needs content before it can be implemented." });
      return;
    }

    // Persist resolved plan content if it was reconstructed from conversations
    if (!plan.plan_markdown?.trim()) {
      repos.plans.update(plan.id, { plan_markdown: planMarkdown });
    }

    // Reuse plan workspace if it exists, otherwise create one (backward compat)
    let workspacePath = plan.workspace_path;
    let branchName = plan.branch_name;

    if (!workspacePath || !fs.existsSync(workspacePath)) {
      const selectedRepos = repos.repositories.listSelectedByProject(project.id);
      const result = await createPlanWorkspace({
        planId: plan.id,
        projectId: project.id,
        repos: selectedRepos,
      });
      workspacePath = result.workspacePath;
      branchName = result.branchName;
      repos.plans.update(plan.id, { workspace_path: workspacePath, branch_name: branchName });
    }

    // Build repo directory listing for the agent
    const repoEntries = fs.readdirSync(workspacePath, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== ".git")
      .map(e => e.name);

    if (repoEntries.length === 0) {
      reply.code(500).send({ error: "No repositories found in workspace. Check GitHub connection and repository access." });
      return;
    }

    // Create run record with workspace info for later diff/push
    repos.plans.updateStatus(plan.id, "EXECUTING");
    const run = repos.runs.create({
      plan_id: plan.id,
      workspace_path: workspacePath,
      branch_name: branchName!,
    });

    // Start implementation agent (no auto commit/push/PR)
    (async () => {
      try {
        repos.runs.setStarted(run.id);
        repos.runs.updateStatus(run.id, "RUNNING");

        await startImplementationAgent({
          planId: plan.id,
          planMarkdown,
          workspacePath,
          projectId: project.id,
          repoDirectories: repoEntries,
        });

        // Agent finished — mark run as awaiting review (not DONE)
        repos.runs.updateStatus(run.id, "REVIEW");
      } catch (err: any) {
        app.log.error({ runId: run.id, err }, "Implementation failed");
        repos.runs.updateStatus(run.id, "FAILED", err.message);
        repos.plans.updateStatus(plan.id, "FAILED");
        repos.runs.setEnded(run.id);
      }
    })();

    return { runId: run.id };
  });

  // Get workspace diff for a run
  app.get<{ Params: { runId: string }; Querystring: { context?: string } }>("/api/runs/:runId/diff", async (request, reply) => {
    const repos = getRepos();
    const run = repos.runs.findById(request.params.runId);
    if (!run) {
      reply.code(404).send({ error: "Run not found" });
      return;
    }
    if (!run.workspace_path) {
      reply.code(400).send({ error: "No workspace associated with this run" });
      return;
    }

    // Context lines around each change (default 3, max 9999 for "full file")
    const contextLines = Math.min(Math.max(parseInt(request.query.context || "3", 10) || 3, 0), 9999);

    const diffs: { repo: string; diff: string }[] = [];

    try {
      const entries = fs.readdirSync(run.workspace_path, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === ".git") continue;
        const repoDir = path.join(run.workspace_path, entry.name);
        try {
          const repoGit = simpleGit(repoDir);
          // Get both unstaged and staged diffs with configurable context
          const unstaged = await repoGit.diff([`-U${contextLines}`]);
          const staged = await repoGit.diff(["--cached", `-U${contextLines}`]);
          // Also get untracked files as diffs
          const status = await repoGit.status();
          let untrackedDiff = "";
          for (const file of status.not_added) {
            const filePath = path.join(repoDir, file);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              try {
                const content = fs.readFileSync(filePath, "utf-8");
                untrackedDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split("\n").length} @@\n${content.split("\n").map(l => `+${l}`).join("\n")}\n`;
              } catch {
                // skip binary files
              }
            }
          }
          const combined = [unstaged, staged, untrackedDiff].filter(Boolean).join("\n");
          if (combined.trim()) {
            diffs.push({ repo: entry.name, diff: combined });
          }
        } catch {
          // skip non-git directories
        }
      }
    } catch (err: any) {
      reply.code(500).send({ error: `Failed to read workspace: ${err.message}` });
      return;
    }

    return diffs;
  });

  // Push branch and create PR for a run
  app.post<{ Params: { runId: string } }>("/api/runs/:runId/push", async (request, reply) => {
    const repos = getRepos();
    const run = repos.runs.findById(request.params.runId);
    if (!run) {
      reply.code(404).send({ error: "Run not found" });
      return;
    }
    if (!run.workspace_path || !run.branch_name) {
      reply.code(400).send({ error: "No workspace or branch associated with this run" });
      return;
    }

    const plan = repos.plans.findById(run.plan_id);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    const project = repos.projects.findById(plan.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const token = getOAuthToken(project.id);
    if (!token) {
      reply.code(400).send({ error: "GitHub not connected" });
      return;
    }

    // Get task info for PR description
    const task = plan.task_id ? repos.tasks.findById(plan.task_id) : null;

    // Collect diffs for PR description generation
    const selectedRepos = repos.repositories.listSelectedByProject(project.id);
    const repoDiffs: { repo: string; diff: string; repoObj: typeof selectedRepos[0]; repoDir: string }[] = [];

    for (const repo of selectedRepos) {
      const repoDir = path.join(run.workspace_path, `${repo.owner}_${repo.name}`);
      if (!fs.existsSync(repoDir)) continue;
      try {
        const repoGit = simpleGit(repoDir);
        const status = await repoGit.status();
        if (status.files.length === 0) continue;
        const diff = await repoGit.diff(["HEAD"]);
        const untrackedDiff = status.not_added.map((f) => {
          try {
            const content = fs.readFileSync(path.join(repoDir, f), "utf-8");
            return `diff --git a/${f} b/${f}\nnew file\n--- /dev/null\n+++ b/${f}\n@@ -0,0 +1,${content.split("\n").length} @@\n${content.split("\n").map((l) => `+${l}`).join("\n")}`;
          } catch { return ""; }
        }).filter(Boolean).join("\n");
        repoDiffs.push({
          repo: `${repo.owner}/${repo.name}`,
          diff: [diff, untrackedDiff].filter(Boolean).join("\n"),
          repoObj: repo,
          repoDir,
        });
      } catch (err: any) {
        app.log.warn({ repo: `${repo.owner}/${repo.name}`, err: err.message }, "Failed to get diff for PR");
      }
    }

    if (repoDiffs.length === 0) {
      reply.code(400).send({ error: "No changes to push" });
      return;
    }

    // Generate PR title & description using LLM
    const prDesc = await generatePrDescription({
      projectId: project.id,
      taskTitle: task?.title ?? "Implementation",
      taskDescription: task?.description ?? "",
      planMarkdown: plan.plan_markdown,
      diffs: repoDiffs.map((d) => ({ repo: d.repo, diff: d.diff })),
    });

    const prUrls: string[] = [];

    for (const { repoObj: repo, repoDir } of repoDiffs) {
      try {
        const repoGit = simpleGit(repoDir);
        await repoGit.add(".");
        await repoGit.commit(prDesc.commitMessage);
        await repoGit.push("origin", run.branch_name);

        const result = await createPullRequest({
          projectId: project.id,
          planId: plan.id,
          repositoryId: repo.id,
          repoOwner: repo.owner,
          repoName: repo.name,
          branch: run.branch_name,
          baseBranch: repo.default_branch,
          title: prDesc.title,
          body: prDesc.body,
        });
        prUrls.push(result.prUrl);
      } catch (err: any) {
        app.log.error({ repo: `${repo.owner}/${repo.name}`, err: err.message }, "Failed to push/PR");
      }
    }

    // Mark run as done but keep plan in a state where we track PR merge
    repos.runs.updateStatus(run.id, "DONE");
    repos.runs.setEnded(run.id);
    repos.plans.updateStatus(plan.id, "EXECUTING");
    repos.plans.update(plan.id, { agent_phase: "done" });

    return { prUrls };
  });

  // Check PR merge status and complete plan/task when merged
  app.post<{ Params: { planId: string } }>("/api/plans/:planId/check-merge", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }

    const project = repos.projects.findById(plan.project_id);
    if (!project) {
      reply.code(404).send({ error: "Project not found" });
      return;
    }

    const token = getOAuthToken(project.id);
    if (!token) {
      reply.code(400).send({ error: "GitHub not connected" });
      return;
    }

    const client = new GitHubClient(token);
    const pullRequests = repos.pullRequests.listByPlan(plan.id);
    let allMerged = true;
    let anyOpen = false;

    for (const pr of pullRequests) {
      if (pr.status === "MERGED") continue;
      if (!pr.github_pr_number || !pr.repository_id) { allMerged = false; continue; }

      const repo = repos.repositories.findById(pr.repository_id);
      if (!repo) { allMerged = false; continue; }

      try {
        const ghPr = await client.getPullRequest(repo.owner, repo.name, pr.github_pr_number);
        if (ghPr.merged) {
          repos.pullRequests.updateStatus(pr.id, "MERGED");
        } else if (ghPr.state === "closed") {
          repos.pullRequests.updateStatus(pr.id, "CLOSED");
          allMerged = false;
        } else {
          anyOpen = true;
          allMerged = false;
        }
      } catch (err: any) {
        app.log.warn({ prId: pr.id, err: err.message }, "Failed to check PR status");
        allMerged = false;
      }
    }

    if (allMerged && pullRequests.length > 0) {
      repos.plans.updateStatus(plan.id, "DONE");
      repos.plans.update(plan.id, { agent_phase: "done" });
      // Complete the associated task
      if (plan.task_id) {
        repos.tasks.update(plan.task_id, { status: "DONE" });
      }
    }

    return {
      allMerged,
      anyOpen,
      pullRequests: repos.pullRequests.listByPlan(plan.id),
    };
  });

  // Get pull requests for a plan
  app.get<{ Params: { planId: string } }>("/api/plans/:planId/pull-requests", async (request, reply) => {
    const repos = getRepos();
    const plan = repos.plans.findById(request.params.planId);
    if (!plan) {
      reply.code(404).send({ error: "Plan not found" });
      return;
    }
    return repos.pullRequests.listByPlan(plan.id);
  });
}
