/**
 * Thin typed fetch wrapper for the REST API at /api/v1 (same-origin via the Next rewrite).
 * Feature folders should build their own query hooks on top of `api`.
 * When packages/contracts ships its generated client, swap the internals here, keep the signature.
 */
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "") + "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

type Opts = Omit<RequestInit, "body"> & { body?: unknown; query?: Record<string, string | number | boolean | undefined> };

export async function api<T = unknown>(path: string, { body, query, headers, ...init }: Opts = {}): Promise<T> {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    credentials: "include",
    ...init,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const msg = (data as { message?: string } | undefined)?.message ?? res.statusText;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
