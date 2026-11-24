import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cbt/ui"],
  // Escape hatch during parallel feature development only: SKIP_TYPECHECK=1 pnpm --filter web build
  typescript: { ignoreBuildErrors: process.env.SKIP_TYPECHECK === "1" },
  // API (core agent) is proxied so the browser talks same-origin (cookies just work).
  async rewrites() {
    const api = process.env.API_ORIGIN ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
