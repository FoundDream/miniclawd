/**
 * Scheduler interface.
 */

import type { Schedule, JobPayload, ScheduledJob, JobCallback } from "../types/scheduler.js";

/**
 * Options for adding a job.
 */
export interface AddJobOptions {
  name: string;
  schedule: Schedule;
  payload: JobPayload;
  enabled?: boolean;
  deleteAfterRun?: boolean;
}

/**
 * Interface for scheduler.
 */
export interface IScheduler {
  /**
   * Start the scheduler.
   */
  start(): Promise<void>;

  /**
   * Stop the scheduler.
   */
  stop(): void;

  /**
   * Add a new job.
   */
  addJob(options: AddJobOptions): ScheduledJob;

  /**
   * Remove a job by ID.
   */
  removeJob(jobId: string): boolean;

  /**
   * Enable or disable a job.
   */
  enableJob(jobId: string, enabled: boolean): boolean;

  /**
   * Manually run a job.
   */
  runJob(jobId: string): Promise<void>;

  /**
   * List all jobs.
   */
  listJobs(): ScheduledJob[];

  /**
   * Get scheduler status.
   */
  status(): { running: boolean; jobCount: number; nextWakeAt?: number };
}
