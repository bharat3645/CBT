import { loadEnv } from "@cbt/config";
import { createApp } from "./bootstrap";

async function main() {
  const env = loadEnv();
  const app = await createApp({ env });
  await app.listen(env.PORT);
  console.log(`api listening on :${env.PORT}`);

  // `vite-node --watch` re-evaluates this module on every source change without killing the process.
  // Close the old server first, otherwise the restart dies with EADDRINUSE.
  (import.meta as any).hot?.on?.("vite:beforeFullReload", () => void app.close());
  (import.meta as any).hot?.dispose?.(() => app.close());
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
