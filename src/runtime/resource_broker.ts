/**
 * Resource Broker for Agent Observatory Fleet Orchestration.
 *
 * Implements:
 * 1. Concurrency Semaphore: Prevents CPU/RAM and API rate-limit exhaustion.
 * 2. Single Integration Writer Mutex: Ensures atomic Git branch reconciliation without lock contention.
 * 3. Lease Fencing: Generates monotonically increasing epoch leases to fence off stale workers.
 */

export interface ResourceBrokerOptions {
  maxConcurrentTasks?: number;
}

export interface ResourceBrokerStats {
  activeSlots: number;
  queuedSlots: number;
  maxSlots: number;
  isIntegrationLocked: boolean;
}

export class ResourceBroker {
  private maxSlots: number;
  private activeSlots: number = 0;
  private waitQueue: Array<() => void> = [];
  private integrationLockQueue: Array<() => void> = [];
  private integrationLocked: boolean = false;
  private taskLeases: Map<string, number> = new Map();
  private currentEpoch: number = 0;

  constructor(options: ResourceBrokerOptions = {}) {
    this.maxSlots = Math.max(1, options.maxConcurrentTasks || 4);
  }

  /**
   * Maximum concurrent worker processes allowed.
   */
  getMaxSlots(): number {
    return this.maxSlots;
  }

  /**
   * Updates max concurrency limit dynamically.
   */
  setMaxSlots(slots: number): void {
    this.maxSlots = Math.max(1, slots);
    this.pumpQueue();
  }

  /**
   * Acquires a process execution slot. Resolves to a release function.
   */
  async acquireSlot(): Promise<() => void> {
    if (this.activeSlots < this.maxSlots) {
      this.activeSlots++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.activeSlots--;
          this.pumpQueue();
        }
      };
    }

    return new Promise<() => void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeSlots++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.activeSlots--;
            this.pumpQueue();
          }
        });
      });
    });
  }

  private pumpQueue(): void {
    while (this.activeSlots < this.maxSlots && this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Single Integration Writer Mutex.
   * Serializes Git merge/rebase operations so two arbiters or workers never touch Git state simultaneously.
   */
  async acquireIntegrationLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.integrationLocked) {
      await new Promise<void>((resolve) => {
        this.integrationLockQueue.push(resolve);
      });
    }

    this.integrationLocked = true;
    try {
      return await fn();
    } finally {
      this.integrationLocked = false;
      if (this.integrationLockQueue.length > 0) {
        const next = this.integrationLockQueue.shift();
        if (next) {
          next();
        }
      }
    }
  }

  /**
   * Generates a new epoch lease for a task.
   */
  issueLease(taskId: string): number {
    this.currentEpoch++;
    this.taskLeases.set(taskId, this.currentEpoch);
    return this.currentEpoch;
  }

  /**
   * Verifies if a worker's lease is still valid and not fenced off by a newer epoch or cancellation.
   */
  isLeaseValid(taskId: string, leaseEpoch: number): boolean {
    const activeEpoch = this.taskLeases.get(taskId);
    return activeEpoch !== undefined && activeEpoch === leaseEpoch;
  }

  /**
   * Revokes a task's lease upon completion or cancellation.
   */
  revokeLease(taskId: string): void {
    this.taskLeases.delete(taskId);
  }

  /**
   * Returns current broker telemetry.
   */
  getStats(): ResourceBrokerStats {
    return {
      activeSlots: this.activeSlots,
      queuedSlots: this.waitQueue.length,
      maxSlots: this.maxSlots,
      isIntegrationLocked: this.integrationLocked
    };
  }
}

export const globalResourceBroker = new ResourceBroker({ maxConcurrentTasks: 4 });
