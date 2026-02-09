/**
 * Unified scheduler service combining cron and heartbeat functionality.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { CronExpressionParser } from "cron-parser";
import type {
  Schedule,
  JobPayload,
  JobState,
  ScheduledJob,
  JobStore,
  JobCallback,
} from "../core/types/scheduler.js";
import type {
  IScheduler,
  AddJobOptions,
} from "../core/interfaces/scheduler.js";
import logger from "../utils/logger.js";

/** Default heartbeat interval: 30 minutes */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

/** Heartbeat prompt */
const HEARTBEAT_PROMPT = `Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK`;

function nowMs(): number {
  return Date.now();
}

function computeNextRun(
  schedule: Schedule,
  currentMs: number,
): number | undefined {
  if (schedule.kind === "at") {
    return schedule.atMs && schedule.atMs > currentMs
      ? schedule.atMs
      : undefined;
  }

  if (schedule.kind === "every") {
    if (!schedule.everyMs || schedule.everyMs <= 0) {
      return undefined;
    }
    return currentMs + schedule.everyMs;
  }

  if (schedule.kind === "cron" && schedule.expr) {
    try {
      const interval = CronExpressionParser.parse(schedule.expr, {
        currentDate: new Date(currentMs),
        tz: schedule.tz,
      });
      return interval.next().getTime();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Create a default job store.
 */
function createStore(): JobStore {
  return {
    version: 1,
    jobs: [],
  };
}

/**
 * Check if HEARTBEAT.md has no actionable content.
 */
function isHeartbeatEmpty(content: string | null): boolean {
  if (!content) return true;

  const skipPatterns = new Set(["- [ ]", "* [ ]", "- [x]", "* [x]"]);

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("<!--") ||
      skipPatterns.has(trimmed)
    ) {
      continue;
    }
    return false;
  }

  return true;
}

/**
 * Unified scheduler service for cron jobs and heartbeat checks.
 *
 * Heartbeat is implemented as a special periodic job that checks
 * HEARTBEAT.md for tasks.
 */
export class Scheduler implements IScheduler {
  private storePath: string;
  private workspace: string;
  private onJob: JobCallback | null;
  private store: JobStore | null = null;
  private timerTimeout: ReturnType<typeof setTimeout> | null = null;
  private _running = false;

  // Heartbeat configuration
  private heartbeatEnabled: boolean;
  private heartbeatIntervalMs: number;
  private heartbeatJobId: string | null = null;

  constructor(options: {
    storePath: string;
    workspace: string;
    onJob?: JobCallback;
    heartbeatEnabled?: boolean;
    heartbeatIntervalMs?: number;
  }) {
    this.storePath = options.storePath;
    this.workspace = options.workspace;
    this.onJob = options.onJob || null;
    this.heartbeatEnabled = options.heartbeatEnabled ?? true;
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs || DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  /**
   * Load jobs from disk.
   */
  private loadStore(): JobStore {
    if (this.store) {
      return this.store;
    }

    if (existsSync(this.storePath)) {
      try {
        const data = JSON.parse(readFileSync(this.storePath, "utf-8"));
        const jobs: ScheduledJob[] = (data.jobs || []).map((j: any) => ({
          id: j.id,
          name: j.name,
          enabled: j.enabled ?? true,
          schedule: {
            kind: j.schedule.kind,
            atMs: j.schedule.atMs,
            everyMs: j.schedule.everyMs,
            expr: j.schedule.expr,
            tz: j.schedule.tz,
          },
          payload: {
            kind: j.payload?.kind || "agent_turn",
            message: j.payload?.message || "",
            deliver: j.payload?.deliver || false,
            channel: j.payload?.channel,
            to: j.payload?.to,
          },
          state: {
            nextRunAtMs: j.state?.nextRunAtMs,
            lastRunAtMs: j.state?.lastRunAtMs,
            lastStatus: j.state?.lastStatus,
            lastError: j.state?.lastError,
          },
          createdAtMs: j.createdAtMs || 0,
          updatedAtMs: j.updatedAtMs || 0,
          deleteAfterRun: j.deleteAfterRun || false,
        }));
        this.store = { version: data.version || 1, jobs };
      } catch (error) {
        logger.warn({ error }, "Failed to load scheduler store");
        this.store = createStore();
      }
    } else {
      this.store = createStore();
    }

    return this.store;
  }

  /**
   * Save jobs to disk.
   */
  private saveStore(): void {
    if (!this.store) return;

    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Filter out heartbeat job from persistence
    const persistJobs = this.store.jobs.filter(
      (j) => j.id !== this.heartbeatJobId,
    );

    const data = {
      version: this.store.version,
      jobs: persistJobs.map((j) => ({
        id: j.id,
        name: j.name,
        enabled: j.enabled,
        schedule: {
          kind: j.schedule.kind,
          atMs: j.schedule.atMs,
          everyMs: j.schedule.everyMs,
          expr: j.schedule.expr,
          tz: j.schedule.tz,
        },
        payload: {
          kind: j.payload.kind,
          message: j.payload.message,
          deliver: j.payload.deliver,
          channel: j.payload.channel,
          to: j.payload.to,
        },
        state: {
          nextRunAtMs: j.state.nextRunAtMs,
          lastRunAtMs: j.state.lastRunAtMs,
          lastStatus: j.state.lastStatus,
          lastError: j.state.lastError,
        },
        createdAtMs: j.createdAtMs,
        updatedAtMs: j.updatedAtMs,
        deleteAfterRun: j.deleteAfterRun,
      })),
    };

    writeFileSync(this.storePath, JSON.stringify(data, null, 2));
  }

  /**
   * Start the scheduler.
   */
  async start(): Promise<void> {
    this._running = true;
    this.loadStore();

    // Add heartbeat as a special job
    if (this.heartbeatEnabled) {
      this.addHeartbeatJob();
    }

    this.recomputeNextRuns();
    this.saveStore();
    this.armTimer();
    logger.info({ jobs: this.store?.jobs.length || 0 }, "Scheduler started");
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    this._running = false;
    if (this.timerTimeout) {
      clearTimeout(this.timerTimeout);
      this.timerTimeout = null;
    }
  }

  /**
   * Add heartbeat as a periodic job.
   */
  private addHeartbeatJob(): void {
    if (!this.store) return;

    // Check if heartbeat job already exists
    const existing = this.store.jobs.find(
      (j) => j.payload.kind === "heartbeat",
    );
    if (existing) {
      this.heartbeatJobId = existing.id;
      return;
    }

    const now = nowMs();
    const job: ScheduledJob = {
      id: `heartbeat-${randomUUID().slice(0, 8)}`,
      name: "Heartbeat",
      enabled: true,
      schedule: {
        kind: "every",
        everyMs: this.heartbeatIntervalMs,
      },
      payload: {
        kind: "heartbeat",
        message: HEARTBEAT_PROMPT,
        deliver: false,
      },
      state: {
        nextRunAtMs: now + this.heartbeatIntervalMs,
      },
      createdAtMs: now,
      updatedAtMs: now,
      deleteAfterRun: false,
    };

    this.heartbeatJobId = job.id;
    this.store.jobs.push(job);
    logger.info(
      { intervalMs: this.heartbeatIntervalMs },
      "Heartbeat job added",
    );
  }

  /**
   * Recompute next run times for all enabled jobs.
   */
  private recomputeNextRuns(): void {
    if (!this.store) return;
    const now = nowMs();
    for (const job of this.store.jobs) {
      if (job.enabled) {
        job.state.nextRunAtMs = computeNextRun(job.schedule, now);
      }
    }
  }

  /**
   * Get the earliest next run time across all jobs.
   */
  private getNextWakeMs(): number | undefined {
    if (!this.store) return undefined;
    const times = this.store.jobs
      .filter((j) => j.enabled && j.state.nextRunAtMs)
      .map((j) => j.state.nextRunAtMs!);
    return times.length > 0 ? Math.min(...times) : undefined;
  }

  /**
   * Schedule the next timer tick.
   */
  private armTimer(): void {
    if (this.timerTimeout) {
      clearTimeout(this.timerTimeout);
      this.timerTimeout = null;
    }

    const nextWake = this.getNextWakeMs();
    if (!nextWake || !this._running) {
      return;
    }

    const delayMs = Math.max(0, nextWake - nowMs());

    this.timerTimeout = setTimeout(async () => {
      if (this._running) {
        await this.onTimer();
      }
    }, delayMs);
  }

  /**
   * Handle timer tick - run due jobs.
   */
  private async onTimer(): Promise<void> {
    if (!this.store) return;

    const now = nowMs();
    const dueJobs = this.store.jobs.filter(
      (j) => j.enabled && j.state.nextRunAtMs && now >= j.state.nextRunAtMs,
    );

    for (const job of dueJobs) {
      await this.executeJob(job);
    }

    this.saveStore();
    this.armTimer();
  }

  /**
   * Execute a single job.
   */
  private async executeJob(job: ScheduledJob): Promise<void> {
    const startMs = nowMs();

    // Special handling for heartbeat jobs
    if (job.payload.kind === "heartbeat") {
      const shouldRun = this.checkHeartbeatFile();
      if (!shouldRun) {
        logger.debug("Heartbeat: no tasks (HEARTBEAT.md empty)");
        job.state.lastStatus = "skipped";
        job.state.lastRunAtMs = startMs;
        job.updatedAtMs = nowMs();
        job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs());
        return;
      }
    }

    logger.info({ jobId: job.id, name: job.name }, "Scheduler: executing job");

    try {
      if (this.onJob) {
        await this.onJob(job);
      }

      job.state.lastStatus = "ok";
      job.state.lastError = undefined;
      logger.info(
        { jobId: job.id, name: job.name },
        "Scheduler: job completed",
      );
    } catch (error) {
      job.state.lastStatus = "error";
      job.state.lastError = String(error);
      logger.error(
        { jobId: job.id, name: job.name, error },
        "Scheduler: job failed",
      );
    }

    job.state.lastRunAtMs = startMs;
    job.updatedAtMs = nowMs();

    // Handle one-shot jobs
    if (job.schedule.kind === "at") {
      if (job.deleteAfterRun && this.store) {
        this.store.jobs = this.store.jobs.filter((j) => j.id !== job.id);
      } else {
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
      }
    } else {
      // Compute next run
      job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs());
    }
  }

  /**
   * Check if HEARTBEAT.md has actionable content.
   */
  private checkHeartbeatFile(): boolean {
    const heartbeatPath = join(this.workspace, "HEARTBEAT.md");
    if (!existsSync(heartbeatPath)) {
      return false;
    }

    try {
      const content = readFileSync(heartbeatPath, "utf-8");
      return !isHeartbeatEmpty(content);
    } catch {
      return false;
    }
  }

  // ========== Public API ==========

  /**
   * List all jobs.
   */
  listJobs(): ScheduledJob[] {
    const store = this.loadStore();
    return store.jobs
      .filter((j) => j.id !== this.heartbeatJobId)
      .sort(
        (a, b) =>
          (a.state.nextRunAtMs || Infinity) - (b.state.nextRunAtMs || Infinity),
      );
  }

  /**
   * Add a new job.
   */
  addJob(options: AddJobOptions): ScheduledJob {
    const store = this.loadStore();
    const now = nowMs();

    const job: ScheduledJob = {
      id: randomUUID().slice(0, 8),
      name: options.name,
      enabled: options.enabled ?? true,
      schedule: options.schedule,
      payload: options.payload,
      state: {
        nextRunAtMs: computeNextRun(options.schedule, now),
      },
      createdAtMs: now,
      updatedAtMs: now,
      deleteAfterRun: options.deleteAfterRun || false,
    };

    store.jobs.push(job);
    this.saveStore();
    this.armTimer();

    logger.info({ jobId: job.id, name: job.name }, "Scheduler: added job");
    return job;
  }

  /**
   * Remove a job by ID.
   */
  removeJob(jobId: string): boolean {
    const store = this.loadStore();
    const before = store.jobs.length;
    store.jobs = store.jobs.filter((j) => j.id !== jobId);
    const removed = store.jobs.length < before;

    if (removed) {
      this.saveStore();
      this.armTimer();
      logger.info({ jobId }, "Scheduler: removed job");
    }

    return removed;
  }

  /**
   * Enable or disable a job.
   */
  enableJob(jobId: string, enabled: boolean = true): boolean {
    const store = this.loadStore();
    const job = store.jobs.find((j) => j.id === jobId);

    if (job) {
      job.enabled = enabled;
      job.updatedAtMs = nowMs();
      if (enabled) {
        job.state.nextRunAtMs = computeNextRun(job.schedule, nowMs());
      } else {
        job.state.nextRunAtMs = undefined;
      }
      this.saveStore();
      this.armTimer();
      return true;
    }

    return false;
  }

  /**
   * Manually run a job.
   */
  async runJob(jobId: string): Promise<void> {
    const store = this.loadStore();
    const job = store.jobs.find((j) => j.id === jobId);

    if (job) {
      await this.executeJob(job);
      this.saveStore();
      this.armTimer();
    }
  }

  /**
   * Get scheduler status.
   */
  status(): { running: boolean; jobCount: number; nextWakeAt?: number } {
    const store = this.loadStore();
    return {
      running: this._running,
      jobCount: store.jobs.filter((j) => j.id !== this.heartbeatJobId).length,
      nextWakeAt: this.getNextWakeMs(),
    };
  }

  /**
   * Manually trigger heartbeat.
   */
  async triggerHeartbeat(): Promise<void> {
    if (this.heartbeatJobId) {
      const store = this.loadStore();
      const job = store.jobs.find((j) => j.id === this.heartbeatJobId);
      if (job && this.onJob) {
        await this.onJob(job);
      }
    }
  }
}
