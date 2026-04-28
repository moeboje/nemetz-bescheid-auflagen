import { loadConfig } from "./config.js";
import { runNotificationDispatchCycle } from "./notifications.js";
import { disconnectPrisma, prisma } from "./prisma.js";

async function main() {
  const config = loadConfig();
  const summary = await runNotificationDispatchCycle(prisma, config);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main()
  .then(async () => {
    await disconnectPrisma();
  })
  .catch(async (error: unknown) => {
    await disconnectPrisma();
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
    }
    process.exit(1);
  });
