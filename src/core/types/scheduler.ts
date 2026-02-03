/**
 * Scheduler types for cron and periodic tasks.
 */

/**
 * Schedule definition for a job.
 */
export interface Schedule {
  /** Schedule type */
  kind: "at" | "every" | "cron";
  /** For "at": timestamp in ms */
  atMs?: number;
  /** For "every": interval in ms */
  everyMs?: number;
  /** For "cron": cron expression (e.g. "0 9 * * *") */
  expr?: string;
  /** Timezone for cron expressions */
  tz?: string;
}

/**
 * What to do when the job runs.
 */
export interface JobPayload {
  kind: "system_event" | "agent_turn" | "heartbeat";
  message: string;
  /** Deliver response to channel */
  deliver: boolean;
  channel?: string;
  to?: string;
}

/**
 * Runtime state of a job.
 */
export interface JobState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
}

/**
 * A scheduled job.
 */
export interface ScheduledJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: Schedule;
  payload: JobPayload;
  state: JobState;
  createdAtMs: number;
  updatedAtMs: number;
  deleteAfterRun: boolean;
}

/**
 * Persistent store for scheduled jobs.
 */
export interface JobStore {
  version: number;
  jobs: ScheduledJob[];
}

/**
 * Job execution callback.
 */
export type JobCallback = (job: ScheduledJob) => Promise<void>;
