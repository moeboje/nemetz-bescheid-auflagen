import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { loadConfig, loadProjectEnvFile } from "./config.js";
import { hashPassword } from "./security.js";
import { resolveExplicitAdminCredentials } from "./adminCredentials.js";
import { ROLE_CATALOG } from "./accessControl.js";
import { setStoredRolePermissionKeys } from "./rolePermissions.js";
import { ensureSecuritySettings } from "./securitySettings.js";
import { ensureNotificationSettings } from "./notificationSettings.js";

const systemRoles = ROLE_CATALOG;

async function ensureSystemRoles() {
  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: {
        key: role.key
      },
      update: {
        labelDe: role.labelDe,
        descriptionDe: role.descriptionDe,
        isSystem: true,
        isArchived: false
      },
      create: {
        id: randomUUID(),
        key: role.key,
        labelDe: role.labelDe,
        descriptionDe: role.descriptionDe,
        isSystem: true,
        isArchived: false
      }
    });
    await setStoredRolePermissionKeys(prisma, role.key, role.permissionKeys);
  }
}

async function ensureInitialAdminUser() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return;
  }

  const { adminEmail, adminPassword } = resolveExplicitAdminCredentials("bootstrap");

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
  const config = loadConfig();
  await ensureSystemRoles();
  await ensureSecuritySettings(prisma, config);
  await ensureNotificationSettings(prisma);
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
