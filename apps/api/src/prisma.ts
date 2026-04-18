import { PrismaClient } from "@prisma/client";
import { loadProjectEnvFile, resolveDatabaseUrl } from "./config.js";

loadProjectEnvFile();
process.env.DATABASE_URL = resolveDatabaseUrl(process.env);

export const prisma = new PrismaClient();

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
