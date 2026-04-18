import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { loadProjectEnvFile } from "./config.js";
import { hashPassword, validatePassword } from "./security.js";

const systemRoles = [
  { key: "ADMIN", labelDe: "Admin" },
  { key: "COMPLIANCE", labelDe: "Compliance" },
  { key: "USER", labelDe: "Benutzer" },
  { key: "EXTERNAL", labelDe: "Extern" }
] as const;

async function ensureSystemRoles() {
  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: {
        key: role.key
      },
      update: {
        labelDe: role.labelDe,
        isSystem: true,
        isArchived: false
      },
      create: {
        id: randomUUID(),
        key: role.key,
        labelDe: role.labelDe,
        isSystem: true,
        isArchived: false
      }
    });
  }
}

async function ensureInitialAdminUser() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return;
  }

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const passwordValidation = validatePassword(adminPassword);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.message || "Invalid ADMIN_PASSWORD");
  }

  const passwordHash = await hashPassword(adminPassword);

  await prisma.user.create({
    data: {
      id: randomUUID(),
      firstName: "Admin",
      lastName: "User",
      email: adminEmail,
      role: "ADMIN",
      type: "INTERNAL",
      isArchived: false,
      passwordHash,
      passwordUpdatedAt: new Date()
    }
  });
}

async function run() {
  loadProjectEnvFile();
  await ensureSystemRoles();
  await ensureInitialAdminUser();
}

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect();
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
    }
    process.exit(1);
  });
