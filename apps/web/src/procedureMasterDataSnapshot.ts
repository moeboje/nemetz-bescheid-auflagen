import type { LegalMatter, ProcedureType, SubmissionType } from "./data/procedureMasterData";

export function applyLegalMatterToSubmissionTypes(
  submissionTypes: SubmissionType[],
  legalMatter: LegalMatter
) {
  return submissionTypes.map((submissionType) =>
    submissionType.legalMatterId === legalMatter.id
      ? {
          ...submissionType,
          legalMatterCode: legalMatter.code,
          legalMatterLabel: legalMatter.name,
          legalMatterShortName: legalMatter.shortName ?? "",
          legalMatterIsActive: legalMatter.isActive
        }
      : submissionType
  );
}

export function applyProcedureTypeToSubmissionTypes(
  submissionTypes: SubmissionType[],
  procedureType: ProcedureType
) {
  return submissionTypes.map((submissionType) =>
    submissionType.procedureTypeId === procedureType.id
      ? {
          ...submissionType,
          procedureTypeCode: procedureType.code,
          procedureTypeLabel: procedureType.name,
          procedureTypeShortName: procedureType.shortName ?? "",
          procedureTypeIsActive: procedureType.isActive
        }
      : submissionType
  );
}
