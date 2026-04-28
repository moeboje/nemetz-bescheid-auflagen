import { Prisma, type PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const NOTIFICATION_SETTINGS_ID = "global";
export const MIN_DUE_SOON_DAYS = 1;
export const MAX_DUE_SOON_DAYS = 30;
export const MIN_DIGEST_HOUR = 0;
export const MAX_DIGEST_HOUR = 23;
export const MIN_WEEKDAY = 1;
export const MAX_WEEKDAY = 7;

export type EffectiveNotificationSettings = {
  defaultDueSoonDays: number;
  deadlineDueSoonEnabled: boolean;
  assignmentAssignedEnabled: boolean;
  dailyDigestEnabled: boolean;
  weeklyDigestEnabled: boolean;
  dailyDigestHourLocal: number;
  weeklyDigestWeekday: number;
};

export function getDefaultNotificationSettings(): EffectiveNotificationSettings {
  return {
    defaultDueSoonDays: 7,
    deadlineDueSoonEnabled: true,
    assignmentAssignedEnabled: true,
    dailyDigestEnabled: false,
    weeklyDigestEnabled: false,
    dailyDigestHourLocal: 7,
    weeklyDigestWeekday: 1
  };
}

export function sanitizeNotificationSettingsInput(
  input: Partial<EffectiveNotificationSettings>,
  current: EffectiveNotificationSettings
): EffectiveNotificationSettings {
  return {
    defaultDueSoonDays:
      typeof input.defaultDueSoonDays === "number"
        ? Math.min(Math.max(Math.trunc(input.defaultDueSoonDays), MIN_DUE_SOON_DAYS), MAX_DUE_SOON_DAYS)
        : current.defaultDueSoonDays,
    deadlineDueSoonEnabled:
      typeof input.deadlineDueSoonEnabled === "boolean"
        ? input.deadlineDueSoonEnabled
        : current.deadlineDueSoonEnabled,
    assignmentAssignedEnabled:
      typeof input.assignmentAssignedEnabled === "boolean"
        ? input.assignmentAssignedEnabled
        : current.assignmentAssignedEnabled,
    dailyDigestEnabled:
      typeof input.dailyDigestEnabled === "boolean" ? input.dailyDigestEnabled : current.dailyDigestEnabled,
    weeklyDigestEnabled:
      typeof input.weeklyDigestEnabled === "boolean" ? input.weeklyDigestEnabled : current.weeklyDigestEnabled,
    dailyDigestHourLocal:
      typeof input.dailyDigestHourLocal === "number"
        ? Math.min(Math.max(Math.trunc(input.dailyDigestHourLocal), MIN_DIGEST_HOUR), MAX_DIGEST_HOUR)
        : current.dailyDigestHourLocal,
    weeklyDigestWeekday:
      typeof input.weeklyDigestWeekday === "number"
        ? Math.min(Math.max(Math.trunc(input.weeklyDigestWeekday), MIN_WEEKDAY), MAX_WEEKDAY)
        : current.weeklyDigestWeekday
  };
}

export async function getEffectiveNotificationSettings(prisma: DbClient) {
  const defaults = getDefaultNotificationSettings();
  const row = await prisma.notificationSettings.findUnique({
    where: {
      id: NOTIFICATION_SETTINGS_ID
    }
  });

  if (!row) {
    return defaults;
  }

  return sanitizeNotificationSettingsInput(
    {
      defaultDueSoonDays: row.defaultDueSoonDays,
      deadlineDueSoonEnabled: row.deadlineDueSoonEnabled,
      assignmentAssignedEnabled: row.assignmentAssignedEnabled,
      dailyDigestEnabled: row.dailyDigestEnabled,
      weeklyDigestEnabled: row.weeklyDigestEnabled,
      dailyDigestHourLocal: row.dailyDigestHourLocal,
      weeklyDigestWeekday: row.weeklyDigestWeekday
    },
    defaults
  );
}

export async function ensureNotificationSettings(prisma: PrismaClient) {
  const defaults = getDefaultNotificationSettings();
  await prisma.notificationSettings.upsert({
    where: {
      id: NOTIFICATION_SETTINGS_ID
    },
    update: {},
    create: {
      id: NOTIFICATION_SETTINGS_ID,
      ...defaults
    }
  });
}

export async function saveNotificationSettings(prisma: PrismaClient, settings: EffectiveNotificationSettings) {
  await prisma.notificationSettings.upsert({
    where: {
      id: NOTIFICATION_SETTINGS_ID
    },
    update: {
      ...settings
    },
    create: {
      id: NOTIFICATION_SETTINGS_ID,
      ...settings
    }
  });
}
