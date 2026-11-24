import { AsyncLocalStorage } from "node:async_hooks";
import type { AppAbility, Role } from "@cbt/abilities";
import type { Db } from "@cbt/db";

/** Resolved by AuthGuard for every authenticated request. Never derived from client-sent IDs. */
export interface RequestCtx {
  userId: string;
  email: string;
  name: string;
  role: Role;
  /** null for super_admin (platform scope). */
  instituteId: string | null;
  membershipId: string | null;
  isSuperAdmin: boolean;
  /** teacher: batches taught; student: batches enrolled */
  batchIds: string[];
  studentId?: string;
  childStudentIds: string[];
  ability: AppAbility;
}

export interface RequestStore {
  ctx: RequestCtx;
  /** The request's RLS-bound transaction (role cbt_app). */
  tx: Db;
  /** Work to run once the request transaction has COMMITTED (emails, queue jobs, anything using another connection). */
  afterCommit: (() => Promise<void>)[];
}

/** Run fn after the current request's transaction commits; outside a request it runs immediately. */
export async function afterCommit(fn: () => Promise<void>) {
  const s = requestStore.getStore();
  if (s) s.afterCommit.push(fn);
  else await fn();
}

export const requestStore = new AsyncLocalStorage<RequestStore>();

export const currentStore = () => requestStore.getStore();

export function requireCtx(): RequestCtx {
  const s = requestStore.getStore();
  if (!s) throw new Error("No request context: call only from an authenticated request");
  return s.ctx;
}
