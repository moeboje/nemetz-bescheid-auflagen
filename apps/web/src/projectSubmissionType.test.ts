import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROJECT_SUBMISSION_TYPE_VALUES, type Project } from "./data/projects";
import type { SubmissionType } from "./data/procedureMasterData";
import { t } from "./i18n";
import { getProjectSubmissionTypeOptions } from "./projectSubmissionType";

const timestamp = "2026-05-16T00:00:00.000Z";

function submissionType(overrides: Partial<SubmissionType> = {}): SubmissionType {
  return {
    id: overrides.id ?? "st-active",
    code: overrides.code ?? "ACTIVE_TYPE",
    name: overrides.name ?? "Active Type",
    shortName: overrides.shortName,
    legalMatterId: overrides.legalMatterId ?? "lm-active",
    procedureTypeId: overrides.procedureTypeId ?? "pt-active",
    legalMatterIsActive: overrides.legalMatterIsActive,
    procedureTypeIsActive: overrides.procedureTypeIsActive,
    isActive: overrides.isActive ?? true,
    sortOrder: overrides.sortOrder ?? 10,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? "project-1",
    title: overrides.title ?? "Project",
    submissionType: overrides.submissionType,
    submissionTypeId: overrides.submissionTypeId,
    submissionTypeCode: overrides.submissionTypeCode,
    submissionTypeLabel: overrides.submissionTypeLabel,
    submissionTypeShortName: overrides.submissionTypeShortName,
    submissionTypeIsActive: overrides.submissionTypeIsActive,
    submissionTypeBadgeVariant: overrides.submissionTypeBadgeVariant,
    companyId: overrides.companyId ?? "company-1",
    internalParticipants: overrides.internalParticipants ?? [],
    participantUserIds: overrides.participantUserIds ?? [],
    dependsOnProjectIds: overrides.dependsOnProjectIds ?? [],
    referenceLegalDocIds: overrides.referenceLegalDocIds ?? [],
    externalParticipants: overrides.externalParticipants ?? [],
    attachments: overrides.attachments ?? [],
    isArchived: overrides.isArchived ?? false,
    createdAt: overrides.createdAt ?? timestamp,
    updatedAt: overrides.updatedAt ?? timestamp
  };
}

describe("project submission type options", () => {
  it("keeps inactive project-derived values selectable for list filters", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [submissionType()],
      projects: [
        project({
          submissionTypeId: "st-inactive-parent",
          submissionTypeLabel: "Inactive Parent Type",
          submissionTypeIsActive: false
        })
      ],
      mode: "filter"
    });

    const inactiveOption = options.find((option) => option.value === "st-inactive-parent");
    assert.equal(inactiveOption?.label, `Inactive Parent Type (${t("projects.submissionType.inactive")})`);
    assert.notEqual(inactiveOption?.disabled, true);
  });

  it("does not fall back to legacy choices in create mode when lookup options are empty", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [],
      mode: "create"
    });

    assert.deepEqual(options, []);
    assert.equal(
      PROJECT_SUBMISSION_TYPE_VALUES.some((legacyValue) =>
        options.some((option) => option.value === legacyValue)
      ),
      false
    );
  });

  it("does not expose inactive or effectively inactive types as create-form choices", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [
        submissionType({ id: "st-inactive", isActive: false }),
        submissionType({
          id: "st-inactive-legal-matter",
          legalMatterIsActive: false
        }),
        submissionType({
          id: "st-inactive-procedure-type",
          procedureTypeIsActive: false
        })
      ],
      mode: "create"
    });

    assert.deepEqual(options, []);
  });

  it("keeps active effective types selectable in create mode", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [
        submissionType({
          legalMatterIsActive: true,
          procedureTypeIsActive: true
        })
      ],
      mode: "create"
    });

    assert.equal(options.find((option) => option.value === "st-active")?.disabled, undefined);
  });

  it("shows the current inactive edit value disabled while active targets stay selectable", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [submissionType()],
      currentProject: project({
        submissionTypeId: "st-inactive-current",
        submissionTypeLabel: "Inactive Current Type",
        submissionTypeIsActive: false
      }),
      mode: "form"
    });

    assert.equal(options.find((option) => option.value === "st-active")?.disabled, undefined);
    assert.equal(options.find((option) => option.value === "st-inactive-current")?.disabled, true);
  });

  it("shows the current legacy edit value without adding other legacy choices", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [submissionType()],
      currentProject: project({
        submissionType: "GEWERBE"
      }),
      mode: "edit"
    });

    assert.equal(options.find((option) => option.value === "GEWERBE")?.label, "Gewerbe");
    assert.equal(options.some((option) => option.value === "AWG"), false);
    assert.equal(options.some((option) => option.value === "UVP_UVE"), false);
  });

  it("keeps project-derived legacy filter values selectable", () => {
    const options = getProjectSubmissionTypeOptions({
      submissionTypes: [],
      projects: [
        project({
          submissionType: "AWG"
        })
      ],
      mode: "filter"
    });

    assert.equal(options.find((option) => option.value === "AWG")?.label, "AWG");
    assert.notEqual(options.find((option) => option.value === "AWG")?.disabled, true);
  });
});
