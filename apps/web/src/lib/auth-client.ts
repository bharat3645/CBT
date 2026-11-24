"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client. The API (core agent) serves /api/v1/auth; next.config.ts proxies /api/* to it,
 * so in the browser we use same-origin and cookies work without CORS.
 * Organization plugin (organization = institute) is added by the core agent; extend `plugins` here when it lands.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || undefined,
  // The API mounts Better Auth under /api/v1/auth (see apps/api auth module); same-origin via the Next proxy.
  basePath: "/api/v1/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
