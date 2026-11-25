import "./demo/install";
/**
 * Thin typed fetch wrapper for the REST API at /api/v1 (same-origin via the Next rewrite).
 * Feature folders should build their own query hooks on top of `api`.
 * When packages/contracts ships its generated client, swap the internals here, keep the signature.
 */
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "") + "/api/v1";

/** Any non-2xx response. `message` is already human-readable; `body` keeps the parsed payload (zod issues, flags...). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Opts = Omit<RequestInit, "body"> & {
  /** Plain objects are sent as JSON; FormData is sent as multipart (the browser sets the boundary). */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

/** Nest sends `message` as a string or a string[]; pick something readable either way. */
function messageOf(data: unknown, fallback: string): string {
  const m = (data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(m)) return String(m[0] ?? fallback);
  return typeof m === "string" && m ? m : fallback;
}

async function request(path: string, { body, query, headers, ...init }: Opts = {}): Promise<Response> {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  try {
    return await fetch(`${BASE}${path}${qs}`, {
      credentials: "include",
      ...init,
      headers: { ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
}

async function failure(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  const data = text ? safeJson(text) : undefined;
  return new ApiError(res.status, messageOf(data, res.statusText || `Request failed (${res.status})`), data);
}

/** JSON in, JSON out. Throws ApiError on any non-2xx. */
export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const res = await request(path, opts);
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  return (text ? safeJson(text) : undefined) as T;
}

/** For downloads (CSV and the like): returns the response text. */
export async function apiText(path: string, opts: Opts = {}): Promise<string> {
  const res = await request(path, opts);
  if (!res.ok) throw await failure(res);
  return res.text();
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
