import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getOutboxDir() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "..", "storage", "mail-outbox");
}

export type ResetOutboxEntry = {
  toEmail: string;
  resetLink: string;
  expiresAt: string;
  createdAt: string;
};

export async function writePasswordResetOutbox(entry: ResetOutboxEntry) {
  const outboxDir = getOutboxDir();
  await fs.mkdir(outboxDir, { recursive: true });

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `reset-${timestamp}-${random}.json`;
  const target = path.resolve(outboxDir, filename);

  await fs.writeFile(target, `${JSON.stringify(entry, null, 2)}\n`, "utf8");

  return target;
}
