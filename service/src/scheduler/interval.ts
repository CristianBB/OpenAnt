import { acquireLock, releaseLock } from "./lock.js";
import { runReindexQmd } from "./jobs/reindex-qmd.js";
import { runIndexRepoCode } from "./jobs/index-repo-code.js";
import { runPollChannels } from "./jobs/poll-channels.js";
import { runTriage } from "./jobs/run-triage.js";
import { runCheckMergedPrs } from "./jobs/check-merged-prs.js";
import { getLogger } from "../lib/logger.js";

interface ScheduledJob {
  name: string;
  intervalMs: number;
  fn: () => Promise<void>;
  ttlSec: number;
}

const jobs: ScheduledJob[] = [
  { name: "poll-channels", intervalMs: 2 * 60 * 1000, fn: runPollChannels, ttlSec: 120 },
  { name: "run-triage", intervalMs: 30 * 1000, fn: runTriage, ttlSec: 300 },
  { name: "check-merged-prs", intervalMs: 5 * 60 * 1000, fn: runCheckMergedPrs, ttlSec: 120 },
  { name: "reindex-qmd", intervalMs: 10 * 60 * 1000, fn: runReindexQmd, ttlSec: 540 },
  { name: "index-repo-code", intervalMs: 30 * 60 * 1000, fn: runIndexRepoCode, ttlSec: 1200 },
];

const timers: NodeJS.Timeout[] = [];

export function startScheduler(): void {
  const log = getLogger();
  log.info("Starting scheduler");

  for (const job of jobs) {
    const timer = setInterval(async () => {
      if (!acquireLock(job.name, job.ttlSec)) {
        log.debug({ job: job.name }, "Job already locked, skipping");
        return;
      }

      try {
        log.info({ job: job.name }, "Running scheduled job");
        await job.fn();
      } catch (err) {
        log.error({ job: job.name, err }, "Scheduled job failed");
      } finally {
        releaseLock(job.name);
      }
    }, job.intervalMs);

    timers.push(timer);
  }
}

export function stopScheduler(): void {
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
}
