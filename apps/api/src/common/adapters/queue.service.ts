import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import type { Env } from "@cbt/config";
import { ENV } from "../db/db.module";

/** Thin producer over BullMQ so modules never import it. Processing lives in apps/worker. */
export abstract class QueueService {
  abstract enqueue(queue: string, name: string, payload: unknown, opts?: { jobId?: string; delayMs?: number }): Promise<void>;
}

@Injectable()
export class BullQueueService extends QueueService implements OnApplicationShutdown {
  private queues = new Map<string, any>();
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }
  private async q(name: string) {
    let q = this.queues.get(name);
    if (!q) {
      const { Queue } = await import("bullmq");
      q = new Queue(name, { connection: { url: this.env.VALKEY_URL } as any });
      this.queues.set(name, q);
    }
    return q;
  }
  async enqueue(queue: string, name: string, payload: unknown, opts: { jobId?: string; delayMs?: number } = {}) {
    await (await this.q(queue)).add(name, payload, {
      jobId: opts.jobId, delay: opts.delayMs, attempts: 5, backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000, removeOnFail: 5000,
    });
  }
  async onApplicationShutdown() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

/** Dev/test: drops jobs on the floor but remembers them for assertions. */
@Injectable()
export class NoopQueueService extends QueueService {
  readonly jobs: { queue: string; name: string; payload: unknown }[] = [];
  async enqueue(queue: string, name: string, payload: unknown) {
    this.jobs.push({ queue, name, payload });
  }
}
