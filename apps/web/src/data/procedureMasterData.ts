export type BadgeVariant = "neutral" | "success" | "warning" | "danger";

export type LegalMatter = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  badgeVariant?: BadgeVariant;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type ProcedureType = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionType = {
  id: string;
  code: string;
  name: string;
  shortName?: string;
  description?: string;
  legalMatterId: string;
  procedureTypeId: string;
  legalMatterCode?: string;
  legalMatterLabel?: string;
  legalMatterShortName?: string;
  legalMatterIsActive?: boolean;
  procedureTypeCode?: string;
  procedureTypeLabel?: string;
  procedureTypeShortName?: string;
  procedureTypeIsActive?: boolean;
  isActive: boolean;
  isLegacy?: boolean;
  sortOrder: number;
  badgeVariant?: BadgeVariant;
  legacyAliases?: string[];
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type ProcedureMasterDataSnapshot = {
  legalMatters: LegalMatter[];
  procedureTypes: ProcedureType[];
  submissionTypes: SubmissionType[];
};
