import Dexie, { type Table } from "dexie";
import type { AutosaveItem } from "@cbt/contracts/exams";

export interface OutboxRow { id?: number; attemptId: string; questionId: string; seq: number; item: AutosaveItem }

class CbtDb extends Dexie {
  outbox!: Table<OutboxRow, number>;
  constructor() {
    super("cbt-offline");
    this.version(1).stores({ outbox: "++id, attemptId, [attemptId+questionId], seq" });
  }
}
let _db: CbtDb | null = null;
const db = () => (_db ??= new CbtDb());

/** Keep only the highest-seq item per question. Pure, so it is unit-testable. */
export function coalesce(items: AutosaveItem[]): AutosaveItem[] {
  const best = new Map<string, AutosaveItem>();
  for (const it of items) {
    const cur = best.get(it.questionId);
    if (!cur || it.seq > cur.seq) best.set(it.questionId, it);
  }
  return [...best.values()].sort((a, b) => a.seq - b.seq);
}

export async function enqueue(attemptId: string, items: AutosaveItem[]) {
  if (!items.length) return;
  await db().outbox.bulkAdd(items.map((item) => ({ attemptId, questionId: item.questionId, seq: item.seq, item })));
}

export async function pending(attemptId: string): Promise<OutboxRow[]> {
  return db().outbox.where("attemptId").equals(attemptId).toArray();
}

/** Remove rows the server has acknowledged (seq <= highest acked for that question). */
export async function ack(rows: OutboxRow[]) {
  await db().outbox.bulkDelete(rows.map((r) => r.id!).filter((x) => x != null));
}

export type Sender = (attemptId: string, items: AutosaveItem[]) => Promise<{ serverRemainingMs: number }>;

/**
 * Flush the queue. Safe to call repeatedly or concurrently: the server upsert is idempotent by seq,
 * so a duplicate flush only produces `ignored` counts. Throws on network error (rows stay queued).
 */
let flushing: Promise<number | null> | null = null;
export function flush(attemptId: string, send: Sender, onRemaining?: (ms: number) => void): Promise<number | null> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const rows = await pending(attemptId);
      if (!rows.length) return null;
      const all = coalesce(rows.map((r) => r.item));
      for (let i = 0; i < all.length; i += 100) {
        const res = await send(attemptId, all.slice(i, i + 100));
        onRemaining?.(res.serverRemainingMs);
      }
      await ack(rows);
      return rows.length;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
