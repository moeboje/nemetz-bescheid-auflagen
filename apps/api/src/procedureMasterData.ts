import { Prisma, type PrismaClient } from "@prisma/client";

export const BADGE_VARIANTS = ["neutral", "success", "warning", "danger"] as const;
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

export const LEGACY_PROJECT_SUBMISSION_TYPE_VALUES = ["GEWERBE", "AWG", "UVP_UVE"] as const;
export type LegacyProjectSubmissionType = (typeof LEGACY_PROJECT_SUBMISSION_TYPE_VALUES)[number];

export const INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE = "Invalid project submission type.";

type DbClient = PrismaClient | Prisma.TransactionClient;

type LegalMatterDefault = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  sortOrder: number;
  badgeVariant?: BadgeVariant;
};

type ProcedureTypeDefault = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  sortOrder: number;
};

type SubmissionTypeDefault = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  legalMatterId: string;
  procedureTypeId: string;
  sortOrder: number;
  badgeVariant?: BadgeVariant;
  legacyAliases?: string[];
};

export type SubmissionTypeSelectionInput = {
  submissionTypeId?: unknown;
  submissionTypeCode?: unknown;
  submissionType?: unknown;
};

export type ResolvedSubmissionTypeSelection = {
  submissionTypeId?: string;
  legacySubmissionType?: LegacyProjectSubmissionType;
};

export const DEFAULT_LEGAL_MATTERS: LegalMatterDefault[] = [
  {
    id: "lm-gewerberecht",
    code: "GEWERBERECHT",
    name: "Gewerberecht",
    shortName: "GewO",
    description: "Gewerberechtliche Verfahren und Betriebsanlagen.",
    sortOrder: 10,
    badgeVariant: "neutral"
  },
  {
    id: "lm-avg",
    code: "AVG",
    name: "AVG",
    shortName: "AVG",
    description: "Allgemeines Verwaltungsverfahren.",
    sortOrder: 20,
    badgeVariant: "neutral"
  },
  {
    id: "lm-awg",
    code: "AWG",
    name: "AWG",
    shortName: "AWG",
    description: "Abfallwirtschaftliche Verfahren.",
    sortOrder: 30,
    badgeVariant: "warning"
  },
  {
    id: "lm-uvp",
    code: "UVP",
    name: "UVP",
    shortName: "UVP",
    description: "Umweltvertraeglichkeitspruefung.",
    sortOrder: 40,
    badgeVariant: "danger"
  },
  { id: "lm-wasserrecht", code: "WASSERRECHT", name: "Wasserrecht", shortName: "WRG", sortOrder: 50 },
  { id: "lm-baurecht", code: "BAURECHT", name: "Baurecht", sortOrder: 60 },
  { id: "lm-naturschutzrecht", code: "NATURSCHUTZRECHT", name: "Naturschutzrecht", sortOrder: 70 },
  { id: "lm-forstrecht", code: "FORSTRECHT", name: "Forstrecht", sortOrder: 80 },
  { id: "lm-arbeitnehmerschutz", code: "ARBEITNEHMERSCHUTZ", name: "Arbeitnehmerschutz", sortOrder: 90 },
  { id: "lm-brandschutz", code: "BRANDSCHUTZ", name: "Brandschutz", sortOrder: 100, badgeVariant: "warning" },
  { id: "lm-ippc-ied", code: "IPPC_IED", name: "IPPC/IED", shortName: "IPPC/IED", sortOrder: 110, badgeVariant: "warning" },
  { id: "lm-sonstiges", code: "SONSTIGES", name: "Sonstiges", sortOrder: 999 }
];

export const DEFAULT_PROCEDURE_TYPES: ProcedureTypeDefault[] = [
  { id: "pt-genehmigung", code: "GENEHMIGUNG", name: "Genehmigung", sortOrder: 10 },
  { id: "pt-aenderung", code: "AENDERUNG", name: "Aenderung", sortOrder: 20 },
  { id: "pt-anzeige", code: "ANZEIGE", name: "Anzeige", sortOrder: 30 },
  { id: "pt-feststellung", code: "FESTSTELLUNG", name: "Feststellung", sortOrder: 40 },
  { id: "pt-ueberpruefung", code: "UEBERPRUEFUNG", name: "Ueberpruefung", sortOrder: 50 },
  { id: "pt-nachkontrolle", code: "NACHKONTROLLE", name: "Nachkontrolle", sortOrder: 60 },
  { id: "pt-auflassung", code: "AUFLASSUNG", name: "Auflassung", sortOrder: 70 },
  { id: "pt-rechtsmittel", code: "RECHTSMITTEL", name: "Rechtsmittel", sortOrder: 80 },
  { id: "pt-wiederverleihung", code: "WIEDERVERLEIHUNG", name: "Wiederverleihung", sortOrder: 90 },
  { id: "pt-verlaengerung", code: "VERLAENGERUNG", name: "Verlaengerung", sortOrder: 100 },
  { id: "pt-kenntnisnahme", code: "KENNTNISNAHME", name: "Kenntnisnahme", sortOrder: 110 },
  { id: "pt-anzeigeverfahren", code: "ANZEIGEVERFAHREN", name: "Anzeigeverfahren", sortOrder: 120 },
  { id: "pt-sonstiges", code: "SONSTIGES", name: "Sonstiges", sortOrder: 999 }
];

export const DEFAULT_SUBMISSION_TYPES: SubmissionTypeDefault[] = [
  {
    id: "st-gewerbliche-betriebsanlage",
    code: "GEWERBLICHE_BETRIEBSANLAGE",
    name: "Gewerbliche Betriebsanlage",
    shortName: "GewO",
    legalMatterId: "lm-gewerberecht",
    procedureTypeId: "pt-genehmigung",
    sortOrder: 10,
    badgeVariant: "neutral",
    legacyAliases: ["GEWERBE", "Gewerbe"]
  },
  {
    id: "st-betriebsanlagenaenderung",
    code: "BETRIEBSANLAGENAENDERUNG",
    name: "Betriebsanlagenaenderung",
    shortName: "GewO Aenderung",
    legalMatterId: "lm-gewerberecht",
    procedureTypeId: "pt-aenderung",
    sortOrder: 20,
    badgeVariant: "neutral",
    legacyAliases: ["Betriebsanlagenaenderung"]
  },
  {
    id: "st-avg-verfahren",
    code: "AVG_VERFAHREN",
    name: "AVG-Verfahren",
    shortName: "AVG",
    legalMatterId: "lm-avg",
    procedureTypeId: "pt-genehmigung",
    sortOrder: 25,
    badgeVariant: "neutral",
    legacyAliases: ["AVG"]
  },
  {
    id: "st-awg-behandlungsanlage",
    code: "AWG_BEHANDLUNGSANLAGE",
    name: "AWG-Behandlungsanlage",
    shortName: "AWG",
    legalMatterId: "lm-awg",
    procedureTypeId: "pt-genehmigung",
    sortOrder: 30,
    badgeVariant: "warning",
    legacyAliases: ["AWG"]
  },
  {
    id: "st-awg-sammlung-behandlung",
    code: "AWG_SAMMLUNG_BEHANDLUNG",
    name: "AWG-Sammlung/Behandlung",
    shortName: "AWG Sammlung",
    legalMatterId: "lm-awg",
    procedureTypeId: "pt-genehmigung",
    sortOrder: 40,
    badgeVariant: "warning",
    legacyAliases: ["AWG-Sammlung/Behandlung"]
  },
  {
    id: "st-uvp-feststellung",
    code: "UVP_FESTSTELLUNG",
    name: "UVP-Feststellung",
    shortName: "UVP Feststellung",
    legalMatterId: "lm-uvp",
    procedureTypeId: "pt-feststellung",
    sortOrder: 50,
    badgeVariant: "danger",
    legacyAliases: ["UVP"]
  },
  {
    id: "st-uvp-genehmigung",
    code: "UVP_GENEHMIGUNG",
    name: "UVP-Genehmigung",
    shortName: "UVP",
    legalMatterId: "lm-uvp",
    procedureTypeId: "pt-genehmigung",
    sortOrder: 60,
    badgeVariant: "danger",
    legacyAliases: ["UVP_UVE", "UVP/UVE"]
  },
  {
    id: "st-wasserrechtliche-bewilligung",
    code: "WASSERRECHTLICHE_BEWILLIGUNG",
    name: "Wasserrechtliche Bewilligung",
    shortName: "WRG",
    legalMatterId: "lm-wasserrecht",
    procedureTypeId: "pt-genehmigung",
    sortOrder: 70,
    legacyAliases: ["wasserrechtliche Bewilligung"]
  },
  {
    id: "st-behoerdliche-anzeige",
    code: "BEHOERDLICHE_ANZEIGE",
    name: "Behoerdliche Anzeige",
    shortName: "Anzeige",
    legalMatterId: "lm-avg",
    procedureTypeId: "pt-anzeige",
    sortOrder: 90,
    legacyAliases: ["Anzeige"]
  },
  {
    id: "st-sonstiges-verfahren",
    code: "SONSTIGES_VERFAHREN",
    name: "Sonstiges Verfahren",
    shortName: "Sonstiges",
    legalMatterId: "lm-sonstiges",
    procedureTypeId: "pt-sonstiges",
    sortOrder: 999,
    legacyAliases: ["Sonstige", "SONSTIGES"]
  }
];

const LEGACY_ENUM_BY_SUBMISSION_TYPE_CODE = new Map<string, LegacyProjectSubmissionType>([
  ["GEWERBLICHE_BETRIEBSANLAGE", "GEWERBE"],
  ["BETRIEBSANLAGENAENDERUNG", "GEWERBE"],
  ["AWG_BEHANDLUNGSANLAGE", "AWG"],
  ["AWG_SAMMLUNG_BEHANDLUNG", "AWG"],
  ["UVP_GENEHMIGUNG", "UVP_UVE"],
  ["UVP_FESTSTELLUNG", "UVP_UVE"]
]);

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeMasterDataCode(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isBadgeVariant(value: unknown): value is BadgeVariant {
  return typeof value === "string" && BADGE_VARIANTS.includes(value as BadgeVariant);
}

export function normalizeBadgeVariant(value: unknown) {
  const trimmed = toOptionalTrimmedString(value);
  if (!trimmed) {
    return undefined;
  }
  return isBadgeVariant(trimmed) ? trimmed : undefined;
}

export function normalizeLegacyProjectSubmissionType(value: unknown) {
  const trimmed = toOptionalTrimmedString(value);
  if (!trimmed) {
    return undefined;
  }
  return LEGACY_PROJECT_SUBMISSION_TYPE_VALUES.includes(trimmed as LegacyProjectSubmissionType)
    ? (trimmed as LegacyProjectSubmissionType)
    : undefined;
}

function aliasesFromJson(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function aliasMatches(value: string, aliases: string[]) {
  const normalizedValue = value.trim().toLocaleLowerCase("de-AT");
  return aliases.some((alias) => alias.trim().toLocaleLowerCase("de-AT") === normalizedValue);
}

export function legacySubmissionTypeForManagedType(input: {
  code?: string | null;
  legacyAliases?: Prisma.JsonValue | null;
}) {
  if (input.code && LEGACY_ENUM_BY_SUBMISSION_TYPE_CODE.has(input.code)) {
    return LEGACY_ENUM_BY_SUBMISSION_TYPE_CODE.get(input.code);
  }

  const aliases = aliasesFromJson(input.legacyAliases);
  const legacyAlias = LEGACY_PROJECT_SUBMISSION_TYPE_VALUES.find((legacyValue) =>
    aliasMatches(legacyValue, aliases)
  );
  return legacyAlias;
}

export async function ensureDefaultProcedureMasterData(db: DbClient) {
  await db.legalMatter.createMany({
    data: DEFAULT_LEGAL_MATTERS.map((entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      shortName: entry.shortName,
      description: entry.description,
      sortOrder: entry.sortOrder,
      badgeVariant: entry.badgeVariant
    })),
    skipDuplicates: true
  });

  await db.procedureType.createMany({
    data: DEFAULT_PROCEDURE_TYPES.map((entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      shortName: entry.shortName,
      description: entry.description,
      sortOrder: entry.sortOrder
    })),
    skipDuplicates: true
  });

  await db.submissionType.createMany({
    data: DEFAULT_SUBMISSION_TYPES.map((entry) => ({
      id: entry.id,
      code: entry.code,
      name: entry.name,
      shortName: entry.shortName,
      description: entry.description,
      legalMatterId: entry.legalMatterId,
      procedureTypeId: entry.procedureTypeId,
      sortOrder: entry.sortOrder,
      badgeVariant: entry.badgeVariant,
      legacyAliases: entry.legacyAliases ?? Prisma.JsonNull
    })),
    skipDuplicates: true
  });
}

async function findSubmissionTypeBySelection(db: DbClient, value: string) {
  const code = normalizeMasterDataCode(value);

  const directMatch = await db.submissionType.findFirst({
    where: {
      OR: [
        { id: value },
        { code },
        { code: value.trim() }
      ]
    },
    select: {
      id: true,
      code: true,
      isActive: true,
      legacyAliases: true,
      legalMatter: {
        select: {
          isActive: true
        }
      },
      procedureType: {
        select: {
          isActive: true
        }
      }
    }
  });

  if (directMatch) {
    return directMatch;
  }

  const candidates = await db.submissionType.findMany({
    select: {
      id: true,
      code: true,
      isActive: true,
      legacyAliases: true,
      legalMatter: {
        select: {
          isActive: true
        }
      },
      procedureType: {
        select: {
          isActive: true
        }
      }
    }
  });

  return candidates.find((candidate) => aliasMatches(value, aliasesFromJson(candidate.legacyAliases))) ?? null;
}

async function createLegacySubmissionType(db: DbClient, value: string) {
  await ensureDefaultProcedureMasterData(db);

  const baseCode = normalizeMasterDataCode(value) || "UNBEKANNT";
  const code = `LEGACY_${baseCode}`.slice(0, 120);
  const existing = await db.submissionType.findUnique({
    where: {
      code
    },
    select: {
      id: true,
      code: true,
      isActive: true,
      legacyAliases: true,
      legalMatter: {
        select: {
          isActive: true
        }
      },
      procedureType: {
        select: {
          isActive: true
        }
      }
    }
  });
  if (existing) {
    return existing;
  }

  return db.submissionType.create({
    data: {
      code,
      name: value.trim(),
      shortName: value.trim().slice(0, 80),
      legalMatterId: "lm-sonstiges",
      procedureTypeId: "pt-sonstiges",
      isActive: false,
      isLegacy: true,
      sortOrder: 10_000,
      badgeVariant: "neutral",
      legacyAliases: [value.trim()]
    },
    select: {
      id: true,
      code: true,
      isActive: true,
      legacyAliases: true,
      legalMatter: {
        select: {
          isActive: true
        }
      },
      procedureType: {
        select: {
          isActive: true
        }
      }
    }
  });
}

export async function resolveSubmissionTypeSelection(
  db: DbClient,
  input: SubmissionTypeSelectionInput,
  options: {
    allowInactiveCurrent?: boolean;
    currentSubmissionTypeId?: string;
    allowInactiveSelection?: boolean;
    allowCreateLegacy?: boolean;
  } = {}
): Promise<ResolvedSubmissionTypeSelection> {
  const rawSelection =
    toOptionalTrimmedString(input.submissionTypeId) ??
    toOptionalTrimmedString(input.submissionTypeCode) ??
    toOptionalTrimmedString(input.submissionType);

  if (!rawSelection) {
    return {};
  }

  await ensureDefaultProcedureMasterData(db);

  let submissionType = await findSubmissionTypeBySelection(db, rawSelection);
  if (!submissionType && options.allowCreateLegacy) {
    submissionType = await createLegacySubmissionType(db, rawSelection);
  }

  if (!submissionType) {
    throw new Error(INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE);
  }

  const isUsable =
    submissionType.isActive &&
    submissionType.legalMatter.isActive &&
    submissionType.procedureType.isActive;
  const isCurrentInactive =
    options.allowInactiveCurrent && submissionType.id === options.currentSubmissionTypeId;

  if (!isUsable && !isCurrentInactive && !options.allowInactiveSelection) {
    throw new Error(INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE);
  }

  return {
    submissionTypeId: submissionType.id,
    legacySubmissionType: legacySubmissionTypeForManagedType(submissionType)
  };
}
