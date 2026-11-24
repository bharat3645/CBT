import { defineConfig } from "@playwright/test";

// Expects the stack to be running: docker compose (postgres, valkey, seaweedfs, gotenberg, mailpit),
// docparse :8000, api :4000, worker, web :3000. See ../demo/README.md.
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    screenshot: "off",
    trace: "retain-on-failure",
  },
  outputDir: "./test-results",
});
