import { Prisma, type PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const SUBMISSION_PROFILE_TYPE_VALUES = ["BASE", "ADDON"] as const;
export type SubmissionProfileType = (typeof SUBMISSION_PROFILE_TYPE_VALUES)[number];

type SubmissionProfileRow = {
  key: string;
  label: string;
  profileType: string;
  isActive: boolean;
};

export const SUBMISSION_PROFILE_DEFINITIONS = [
  {
    key: "GEWERBE",
    label: "Gewerbe",
    profileType: "BASE",
    isActive: true,
    sortOrder: 10
  },
  {
    key: "AWG",
    label: "AWG",
    profileType: "ADDON",
    isActive: true,
    sortOrder: 20
  },
  {
    key: "UVP_UVE",
    label: "UVP/UVE",
    profileType: "ADDON",
    isActive: true,
    sortOrder: 30
  }
] as const;

export type SubmissionProfileKey = (typeof SUBMISSION_PROFILE_DEFINITIONS)[number]["key"];

export type SubmissionProfileDto = {
  key: SubmissionProfileKey;
  label: string;
  profileType: SubmissionProfileType;
  isActive: boolean;
};

export const DEFAULT_PROJECT_SUBMISSION_PROFILE_KEY: SubmissionProfileKey = "GEWERBE";
export const INVALID_SUBMISSION_PROFILE_KEYS_MESSAGE = `Invalid submission profile keys. Allowed values: ${SUBMISSION_PROFILE_DEFINITIONS.map((definition) => definition.key).join(", ")}.`;
export const MISSING_SUBMISSION_PROFILE_BASE_MESSAGE =
  "Projects with add-on submission profiles must also include a base submission profile.";
export const MULTIPLE_SUBMISSION_PROFILE_BASES_MESSAGE =
  "Projects can only have one base submission profile.";

const definitionByKey = new Map(
  SUBMISSION_PROFILE_DEFINITIONS.map((definition) => [definition.key, definition] as const)
);

function normalizeSubmissionProfileType(value: unknown): SubmissionProfileType | null {
  return typeof value === "string" &&
    (SUBMISSION_PROFILE_TYPE_VALUES as readonly string[]).includes(value)
    ? (value as SubmissionProfileType)
    : null;
}

function isSubmissionProfileKey(value: unknown): value is SubmissionProfileKey {
  return typeof value === "string" && definitionByKey.has(value as SubmissionProfileKey);
}

export function normalizeSubmissionProfileKeys(value: unknown): SubmissionProfileKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<SubmissionProfileKey>();
  const normalized: SubmissionProfileKey[] = [];

  value.forEach((entry) => {
    if (!isSubmissionProfileKey(entry)) {
      throw new Error(INVALID_SUBMISSION_PROFILE_KEYS_MESSAGE);
    }
    if (seen.has(entry)) {
      return;
    }
    seen.add(entry);
    normalized.push(entry);
  });

  return sortSubmissionProfileKeys(normalized);
}

export function resolveSubmissionProfileKeysFromUnknown(input: {
  submissionProfileKeys?: unknown;
  submissionProfiles?: unknown;
}) {
  if (input.submissionProfileKeys !== undefined) {
    return normalizeSubmissionProfileKeys(input.submissionProfileKeys);
  }

  if (!Array.isArray(input.submissionProfiles)) {
    return [];
  }

  return normalizeSubmissionProfileKeys(
    input.submissionProfiles.map((row) =>
      row && typeof row === "object" && "key" in row ? (row as { key?: unknown }).key : undefined
    )
  );
}

export function sortSubmissionProfileKeys(keys: SubmissionProfileKey[]) {
  return [...keys].sort((left, right) => {
    const leftDefinition = definitionByKey.get(left);
    const rightDefinition = definitionByKey.get(right);
    if (!leftDefinition || !rightDefinition) {
      return left.localeCompare(right);
    }
    if (leftDefinition.sortOrder !== rightDefinition.sortOrder) {
      return leftDefinition.sortOrder - rightDefinition.sortOrder;
    }
    return left.localeCompare(right);
  });
}

export function validateSubmissionProfileKeys(keys: SubmissionProfileKey[]) {
  const baseKeys = keys.filter((key) => definitionByKey.get(key)?.profileType === "BASE");
  if (baseKeys.length > 1) {
    throw new Error(MULTIPLE_SUBMISSION_PROFILE_BASES_MESSAGE);
  }

  const addonCount = keys.length - baseKeys.length;
  if (addonCount > 0 && baseKeys.length === 0) {
    throw new Error(MISSING_SUBMISSION_PROFILE_BASE_MESSAGE);
  }

  return sortSubmissionProfileKeys(keys);
}

export function buildSubmissionProfileDtos(keys: SubmissionProfileKey[]): SubmissionProfileDto[] {
  return sortSubmissionProfileKeys(keys)
    .map((key) => definitionByKey.get(key))
    .filter((definition): definition is (typeof SUBMISSION_PROFILE_DEFINITIONS)[number] => Boolean(definition))
    .map((definition) => ({
      key: definition.key,
      label: definition.label,
      profileType: definition.profileType,
      isActive: definition.isActive
    }));
}

function toSubmissionProfileDto(profile: SubmissionProfileRow): SubmissionProfileDto | null {
  if (!isSubmissionProfileKey(profile.key)) {
    return null;
  }

  const profileType = normalizeSubmissionProfileType(profile.profileType);
  if (!profileType) {
    return null;
  }

  return {
    key: profile.key,
    label: profile.label,
    profileType,
    isActive: profile.isActive
  };
}

export async function ensureDefaultSubmissionProfiles(db: DbClient) {
  for (const definition of SUBMISSION_PROFILE_DEFINITIONS) {
    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO "SubmissionProfile" ("key", "label", "profileType", "isActive", "sortOrder", "createdAt", "updatedAt")
        VALUES (
          ${definition.key},
          ${definition.label},
          ${definition.profileType}::"SubmissionProfileType",
          ${definition.isActive},
          ${definition.sortOrder},
          NOW(),
          NOW()
        )
        ON CONFLICT ("key") DO UPDATE
        SET
          "label" = EXCLUDED."label",
          "profileType" = EXCLUDED."profileType",
          "isActive" = EXCLUDED."isActive",
          "sortOrder" = EXCLUDED."sortOrder",
          "updatedAt" = NOW()
      `
    );
  }
}

export async function listAvailableSubmissionProfiles(db: DbClient) {
  const profiles = await db.$queryRaw<SubmissionProfileRow[]>(
    Prisma.sql`
      SELECT
        "key",
        "label",
        "profileType"::text AS "profileType",
        "isActive"
      FROM "SubmissionProfile"
      ORDER BY "sortOrder" ASC, "key" ASC
    `
  );

  const normalized = profiles
    .map((profile) => toSubmissionProfileDto(profile))
    .filter((profile): profile is SubmissionProfileDto => Boolean(profile));

  if (normalized.length > 0) {
    return normalized;
  }

  return buildSubmissionProfileDtos(
    SUBMISSION_PROFILE_DEFINITIONS.map((definition) => definition.key)
  );
}
