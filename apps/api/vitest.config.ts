import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

// SWC emits decorator metadata (esbuild does not), which Nest DI needs.
export default defineConfig({
  plugins: [swc.vite({ jsc: { target: "es2022", parser: { syntax: "typescript", decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: { globals: false, environment: "node", testTimeout: 60_000, hookTimeout: 120_000, include: ["src/**/*.test.ts", "test/**/*.test.ts"] },
});
