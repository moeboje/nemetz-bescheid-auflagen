import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { disconnectPrisma } from "./prisma.js";

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  // intentionally no console output to keep runtime clean
});

async function shutdown() {
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
