import { defineConfig } from "vite";
import swc from "unplugin-swc";

// Used by vite-node (dev/start/seed): same SWC pipeline as the tests.
export default defineConfig({
  plugins: [swc.vite({ jsc: { target: "es2022", parser: { syntax: "typescript", decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  ssr: { noExternal: [/^@cbt\//] },
});
