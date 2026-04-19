import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeRoleKey, parsePermissionKeys, type PermissionKey } from "./accessControl.js";

type RawRolePermissionRow = {
  key: string;
  permissionsJson: unknown;
};

export type StoredRolePermissionState = {
  roleExists: boolean;
  hasStoredPermissions: boolean;
  permissionKeys: PermissionKey[];
};

function parseRawPermissions(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

export async function getStoredRolePermissionKeys(prisma: PrismaClient, roleKey: string | null | undefined) {
  const state = await getStoredRolePermissionState(prisma, roleKey);
  return state.permissionKeys;
}

export async function getStoredRolePermissionState(
  prisma: PrismaClient,
  roleKey: string | null | undefined
): Promise<StoredRolePermissionState> {
  const normalizedKey = normalizeRoleKey(roleKey);
  if (!normalizedKey) {
    return {
      roleExists: false,
      hasStoredPermissions: false,
      permissionKeys: []
    };
  }

  const rows = await prisma.$queryRaw<RawRolePermissionRow[]>(Prisma.sql`
    SELECT "key", "permissionsJson"
    FROM "Role"
    WHERE "key" = ${normalizedKey}
    LIMIT 1
  `);

  const row = rows[0];
  const hasStoredPermissions = row?.permissionsJson !== null && row?.permissionsJson !== undefined;

  return {
    roleExists: Boolean(row),
    hasStoredPermissions,
    permissionKeys: hasStoredPermissions ? parsePermissionKeys(parseRawPermissions(row.permissionsJson)) : []
  };
}

export async function getStoredRolePermissionMap(prisma: PrismaClient, roleKeys: Array<string | null | undefined>) {
  const normalizedKeys = Array.from(
    new Set(roleKeys.map((roleKey) => normalizeRoleKey(roleKey)).filter(Boolean))
  );

  if (normalizedKeys.length === 0) {
    return new Map<string, PermissionKey[]>();
  }

  const rows = await prisma.$queryRaw<RawRolePermissionRow[]>(Prisma.sql`
    SELECT "key", "permissionsJson"
    FROM "Role"
    WHERE "key" IN (${Prisma.join(normalizedKeys)})
  `);

  return new Map(
    rows.map((row) => [row.key, parsePermissionKeys(parseRawPermissions(row.permissionsJson))] as const)
  );
}

export async function setStoredRolePermissionKeys(
  prisma: PrismaClient,
  roleKey: string | null | undefined,
  permissionKeys: PermissionKey[]
) {
  const normalizedKey = normalizeRoleKey(roleKey);
  if (!normalizedKey) {
    return;
  }

  const serialized = JSON.stringify(permissionKeys);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Role"
    SET "permissionsJson" = ${serialized}::jsonb
    WHERE "key" = ${normalizedKey}
  `);
}
