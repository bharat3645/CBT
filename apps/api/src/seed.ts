/**
 * Dev seed: super admin + the approved "Demo Academy" institute with a realistic dataset (see seed-demo.ts).
 * Idempotent. Usage: pnpm --filter api seed   (after pnpm --filter @cbt/db db:migrate)
 * To start from a clean slate use `pnpm demo:reset`. All demo passwords are "Passw0rd!Passw0rd";
 * the super admin uses SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD.
 */
import { loadEnv } from "@cbt/config";
import { createDb } from "@cbt/db";

import { runSeed } from "./seed-base";

async function main() {
  const { db, close } = createDb(loadEnv().DATABASE_URL, { max: 2 });
  try {
    await runSeed(db);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
