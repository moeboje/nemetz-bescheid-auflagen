import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  baselineStages,
  classifyMigrationBootstrapMode,
  type BootstrapMode,
  type InspectedForeignKey,
  type InspectedIndex,
  type InspectedKeyConstraint,
  type RequiredForeignKey,
  type RequiredIndex,
  type RequiredKeyConstraint,
  type SchemaRequirements
} from "./migrationBootstrap.js";

const testSchemaName = "public";

type InspectionFixture = {
  schemaName: string;
  presentTables: string[];
  presentColumns: string[];
  presentEnumValues: string[];
  presentIndexes: InspectedIndex[];
  presentPrimaryKeys: InspectedKeyConstraint[];
  presentUniqueConstraints: InspectedKeyConstraint[];
  presentForeignKeys: InspectedForeignKey[];
};

type FixtureRemoval = {
  presentTables?: string[];
  presentColumns?: string[];
  presentEnumValues?: string[];
  presentIndexes?: string[];
  presentPrimaryKeys?: string[];
  presentUniqueConstraints?: string[];
  presentForeignKeys?: string[];
};

function requirementsFor(
  mode: Exclude<BootstrapMode, "fresh" | "ready" | "partial">
): SchemaRequirements {
  const stage = baselineStages.find((candidate) => candidate.mode === mode);
  assert.ok(stage, `Missing baseline stage fixture for ${mode}`);
  return stage.requirements;
}

function introducedFor(
  mode: Exclude<BootstrapMode, "fresh" | "ready" | "partial">
): SchemaRequirements {
  const stage = baselineStages.find((candidate) => candidate.mode === mode);
  assert.ok(stage, `Missing baseline stage fixture for ${mode}`);
  return stage.introduced;
}

function inspectIndex(requirement: RequiredIndex): InspectedIndex {
  return {
    schemaName: testSchemaName,
    name: requirement.name,
    table: requirement.table,
    columns: [...requirement.columns],
    unique: requirement.unique,
    primary: requirement.primary,
    method: requirement.method,
    hasExpressions: false,
    isPartial: false
  };
}

function inspectKeyConstraint(
  requirement: RequiredKeyConstraint,
  type: "PRIMARY KEY" | "UNIQUE"
): InspectedKeyConstraint {
  return {
    schemaName: testSchemaName,
    name: requirement.name,
    type,
    table: requirement.table,
    columns: [...requirement.columns]
  };
}

function inspectForeignKey(requirement: RequiredForeignKey): InspectedForeignKey {
  return {
    schemaName: testSchemaName,
    name: requirement.name,
    table: requirement.table,
    columns: [...requirement.columns],
    referencedSchemaName: testSchemaName,
    referencedTable: requirement.referencedTable,
    referencedColumns: [...requirement.referencedColumns],
    onDelete: requirement.onDelete ?? "NO ACTION",
    onUpdate: requirement.onUpdate ?? "NO ACTION"
  };
}

function fixtureFromRequirements(requirements: SchemaRequirements): InspectionFixture {
  return {
    schemaName: testSchemaName,
    presentTables: [...requirements.tables],
    presentColumns: [...requirements.columns],
    presentEnumValues: [...(requirements.enumValues ?? [])],
    presentIndexes: [...(requirements.indexes ?? [])].map(inspectIndex),
    presentPrimaryKeys: [...(requirements.primaryKeys ?? [])].map((requirement) =>
      inspectKeyConstraint(requirement, "PRIMARY KEY")
    ),
    presentUniqueConstraints: [...(requirements.uniqueConstraints ?? [])].map((requirement) =>
      inspectKeyConstraint(requirement, "UNIQUE")
    ),
    presentForeignKeys: [...(requirements.foreignKeys ?? [])].map(inspectForeignKey)
  };
}

function fixtureFor(mode: Exclude<BootstrapMode, "fresh" | "ready" | "partial">) {
  return fixtureFromRequirements(requirementsFor(mode));
}

function without(fixture: InspectionFixture, removal: FixtureRemoval): InspectionFixture {
  return {
    ...fixture,
    presentTables: fixture.presentTables.filter(
      (value) => !(removal.presentTables ?? []).includes(value)
    ),
    presentColumns: fixture.presentColumns.filter(
      (value) => !(removal.presentColumns ?? []).includes(value)
    ),
    presentEnumValues: fixture.presentEnumValues.filter(
      (value) => !(removal.presentEnumValues ?? []).includes(value)
    ),
    presentIndexes: fixture.presentIndexes.filter(
      (value) => !(removal.presentIndexes ?? []).includes(value.name)
    ),
    presentPrimaryKeys: fixture.presentPrimaryKeys.filter(
      (value) => !(removal.presentPrimaryKeys ?? []).includes(value.name)
    ),
    presentUniqueConstraints: fixture.presentUniqueConstraints.filter(
      (value) => !(removal.presentUniqueConstraints ?? []).includes(value.name)
    ),
    presentForeignKeys: fixture.presentForeignKeys.filter(
      (value) => !(removal.presentForeignKeys ?? []).includes(value.name)
    )
  };
}

function replaceIndex(
  fixture: InspectionFixture,
  name: string,
  patch: Partial<InspectedIndex>
): InspectionFixture {
  let found = false;
  const presentIndexes = fixture.presentIndexes.map((candidate) => {
    if (candidate.name !== name) {
      return candidate;
    }

    found = true;
    return { ...candidate, ...patch };
  });
  assert.ok(found, `Missing index fixture ${name}`);
  return { ...fixture, presentIndexes };
}

function replacePrimaryKey(
  fixture: InspectionFixture,
  name: string,
  patch: Partial<InspectedKeyConstraint>
): InspectionFixture {
  let found = false;
  const presentPrimaryKeys = fixture.presentPrimaryKeys.map((candidate) => {
    if (candidate.name !== name) {
      return candidate;
    }

    found = true;
    return { ...candidate, ...patch };
  });
  assert.ok(found, `Missing primary key fixture ${name}`);
  return { ...fixture, presentPrimaryKeys };
}

function replaceForeignKey(
  fixture: InspectionFixture,
  name: string,
  patch: Partial<InspectedForeignKey>
): InspectionFixture {
  let found = false;
  const presentForeignKeys = fixture.presentForeignKeys.map((candidate) => {
    if (candidate.name !== name) {
      return candidate;
    }

    found = true;
    return { ...candidate, ...patch };
  });
  assert.ok(found, `Missing foreign key fixture ${name}`);
  return { ...fixture, presentForeignKeys };
}

function classify(fixture: InspectionFixture, hasAppliedMigrations = false) {
  return classifyMigrationBootstrapMode({
    hasAppliedMigrations,
    ...fixture
  });
}

describe("migration bootstrap classification", () => {
  it("treats an empty schema as fresh", () => {
    assert.equal(
      classifyMigrationBootstrapMode({
        hasAppliedMigrations: false,
        presentTables: []
      }),
      "fresh"
    );
  });

  it("uses migration history as ready even when table inspection would look partial", () => {
    assert.equal(
      classifyMigrationBootstrapMode({
        hasAppliedMigrations: true,
        presentTables: ["User"],
        presentColumns: ["User.id"]
      }),
      "ready"
    );
  });

  it("detects complete known baseline stages", () => {
    const expectedModes = [
      "baseline-20260418143000_schema_completion",
      "baseline-20260418190000_project_submission_profiles",
      "baseline-20260418223000_project_checklists",
      "baseline-20260419120000_admin_roles_security",
      "baseline-20260419153000_email_notifications_powerautomate_e1",
      "baseline-20260420113000_email_notifications_powerautomate_e2_mvp",
      "baseline-20260422120000_project_status_submission_type",
      "baseline-20260429103000_obligation_recurrence_external_execution",
      "baseline-20260502120000_project_access_legacy_decisions",
      "baseline-20260503143000_branding_assets",
      "baseline-20260507120000_project_legal_doc_descriptions_preview"
    ] as const;

    for (const mode of expectedModes) {
      assert.equal(classify(fixtureFor(mode)), mode);
    }
  });

  it("uses the previous baseline when obligation external execution objects are absent", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260422120000_project_status_submission_type")),
      "baseline-20260422120000_project_status_submission_type"
    );
  });

  it("uses the current obligation recurrence/external execution baseline when complete", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260429103000_obligation_recurrence_external_execution")),
      "baseline-20260429103000_obligation_recurrence_external_execution"
    );
  });

  it("uses the project access baseline when branding assets are absent", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260502120000_project_access_legacy_decisions")),
      "baseline-20260502120000_project_access_legacy_decisions"
    );
  });

  it("uses the branding asset baseline when legal document description fields are absent", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260503143000_branding_assets")),
      "baseline-20260503143000_branding_assets"
    );
  });

  it("uses the latest baseline when project and legal document description fields are complete", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260507120000_project_legal_doc_descriptions_preview")),
      "baseline-20260507120000_project_legal_doc_descriptions_preview"
    );
  });

  it("blocks a partial project/legal document description baseline when one new column is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260507120000_project_legal_doc_descriptions_preview"), {
          presentColumns: ["LegalDocument.contentSummary"]
        })
      ),
      "partial"
    );
  });

  it("blocks a partial branding asset baseline when the unique type index is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260503143000_branding_assets"), {
          presentIndexes: ["BrandingAsset_type_key"]
        })
      ),
      "partial"
    );
  });

  it("blocks a partial branding asset baseline when enum values are missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260503143000_branding_assets"), {
          presentEnumValues: ["BrandingAssetType.SIDEBAR_ICON"]
        })
      ),
      "partial"
    );
  });

  it("blocks a partial obligation recurrence/external execution baseline with only recurrenceEndDate", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260429103000_obligation_recurrence_external_execution"), {
          presentColumns: ["Obligation.externalOrgId", "Obligation.externalUserId"],
          presentIndexes: ["Obligation_externalOrgId_idx", "Obligation_externalUserId_idx"],
          presentForeignKeys: [
            "Obligation_externalOrgId_fkey",
            "Obligation_externalUserId_fkey"
          ]
        })
      ),
      "partial"
    );
  });

  it("blocks a partial obligation external org baseline when the foreign key is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260429103000_obligation_recurrence_external_execution"), {
          presentForeignKeys: ["Obligation_externalOrgId_fkey"]
        })
      ),
      "partial"
    );
  });

  it("blocks a partial obligation external user baseline with a wrong foreign key", () => {
    assert.equal(
      classify(
        replaceForeignKey(
          fixtureFor("baseline-20260429103000_obligation_recurrence_external_execution"),
          "Obligation_externalUserId_fkey",
          { referencedTable: "ExternalOrganization" }
        )
      ),
      "partial"
    );
  });

  it("blocks a partial obligation external baseline with a wrong new index definition", () => {
    assert.equal(
      classify(
        replaceIndex(
          fixtureFor("baseline-20260429103000_obligation_recurrence_external_execution"),
          "Obligation_externalOrgId_idx",
          { columns: ["externalUserId"] }
        )
      ),
      "partial"
    );
  });

  it("accepts a correctly defined required unique index", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260422120000_project_status_submission_type")),
      "baseline-20260422120000_project_status_submission_type"
    );
  });

  it("blocks a same-named non-unique index where a unique index is required", () => {
    assert.equal(
      classify(
        replaceIndex(fixtureFor("baseline-20260422120000_project_status_submission_type"), "User_email_key", {
          unique: false
        })
      ),
      "partial"
    );
  });

  it("blocks a same-named index on the wrong table", () => {
    assert.equal(
      classify(
        replaceIndex(fixtureFor("baseline-20260422120000_project_status_submission_type"), "User_email_key", {
          table: "Session"
        })
      ),
      "partial"
    );
  });

  it("blocks a same-named index with the wrong column", () => {
    assert.equal(
      classify(
        replaceIndex(fixtureFor("baseline-20260422120000_project_status_submission_type"), "User_email_key", {
          columns: ["id"]
        })
      ),
      "partial"
    );
  });

  it("blocks a same-named primary key on the wrong columns", () => {
    assert.equal(
      classify(
        replacePrimaryKey(
          fixtureFor("baseline-20260422120000_project_status_submission_type"),
          "NotificationWorkerStatus_pkey",
          { columns: ["id"] }
        )
      ),
      "partial"
    );
  });

  it("blocks a same-named foreign key with the wrong source table", () => {
    assert.equal(
      classify(
        replaceForeignKey(
          fixtureFor("baseline-20260422120000_project_status_submission_type"),
          "NotificationOutbox_recipientUserId_fkey",
          { table: "Session" }
        )
      ),
      "partial"
    );
  });

  it("blocks a same-named foreign key with the wrong source column", () => {
    assert.equal(
      classify(
        replaceForeignKey(
          fixtureFor("baseline-20260422120000_project_status_submission_type"),
          "NotificationOutbox_recipientUserId_fkey",
          { columns: ["recipientEmail"] }
        )
      ),
      "partial"
    );
  });

  it("blocks a same-named foreign key with the wrong referenced table", () => {
    assert.equal(
      classify(
        replaceForeignKey(
          fixtureFor("baseline-20260422120000_project_status_submission_type"),
          "NotificationOutbox_recipientUserId_fkey",
          { referencedTable: "Session" }
        )
      ),
      "partial"
    );
  });

  it("blocks a same-named foreign key with the wrong referenced column", () => {
    assert.equal(
      classify(
        replaceForeignKey(
          fixtureFor("baseline-20260422120000_project_status_submission_type"),
          "NotificationOutbox_recipientUserId_fkey",
          { referencedColumns: ["email"] }
        )
      ),
      "partial"
    );
  });

  it("accepts a correctly defined required foreign key", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260419153000_email_notifications_powerautomate_e1")),
      "baseline-20260419153000_email_notifications_powerautomate_e1"
    );
  });

  it("accepts the current submissionType baseline without obsolete submission-profile tables", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260422120000_project_status_submission_type"), {
          presentTables: ["SubmissionProfile", "ProjectSubmissionProfileAssignment"],
          presentColumns: [
            "SubmissionProfile.key",
            "SubmissionProfile.label",
            "SubmissionProfile.profileType",
            "SubmissionProfile.isActive",
            "SubmissionProfile.sortOrder",
            "SubmissionProfile.createdAt",
            "SubmissionProfile.updatedAt",
            "ProjectSubmissionProfileAssignment.projectId",
            "ProjectSubmissionProfileAssignment.profileKey",
            "ProjectSubmissionProfileAssignment.createdAt",
            "ProjectSubmissionProfileAssignment.updatedAt"
          ],
          presentEnumValues: ["SubmissionProfileType.BASE", "SubmissionProfileType.ADDON"],
          presentIndexes: [
            "SubmissionProfile_isActive_idx",
            "SubmissionProfile_profileType_sortOrder_idx",
            "ProjectSubmissionProfileAssignment_profileKey_idx"
          ],
          presentPrimaryKeys: [
            "SubmissionProfile_pkey",
            "ProjectSubmissionProfileAssignment_pkey"
          ],
          presentForeignKeys: [
            "ProjectSubmissionProfileAssignment_projectId_fkey",
            "ProjectSubmissionProfileAssignment_profileKey_fkey"
          ]
        })
      ),
      "baseline-20260422120000_project_status_submission_type"
    );
  });

  it("blocks a project-submission-profile legacy baseline with a wrong assignment primary key", () => {
    assert.equal(
      classify(
        replacePrimaryKey(
          fixtureFor("baseline-20260418190000_project_submission_profiles"),
          "ProjectSubmissionProfileAssignment_pkey",
          { columns: ["profileKey", "projectId"] }
        )
      ),
      "partial"
    );
  });

  it("blocks a notification legacy baseline with a wrong recipient foreign key", () => {
    assert.equal(
      classify(
        replaceForeignKey(
          fixtureFor("baseline-20260419153000_email_notifications_powerautomate_e1"),
          "NotificationOutbox_recipientUserId_fkey",
          { referencedColumns: ["email"] }
        )
      ),
      "partial"
    );
  });

  it("blocks a schema-completion baseline when User.passwordHash is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260418143000_schema_completion"), {
          presentColumns: ["User.passwordHash"]
        })
      ),
      "partial"
    );
  });

  it("blocks a schema-completion baseline when LegalDocument.type is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260418143000_schema_completion"), {
          presentColumns: ["LegalDocument.type"]
        })
      ),
      "partial"
    );
  });

  it("uses the pre-notification baseline when notification objects are absent", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260419120000_admin_roles_security")),
      "baseline-20260419120000_admin_roles_security"
    );
  });

  it("blocks an E1 notification baseline when NotificationOutbox.subject is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260419153000_email_notifications_powerautomate_e1"), {
          presentColumns: ["NotificationOutbox.subject"]
        })
      ),
      "partial"
    );
  });

  it("blocks admin security baselining when SecuritySettings is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260419120000_admin_roles_security"), {
          presentTables: ["SecuritySettings"],
          presentColumns: [
            "SecuritySettings.id",
            "SecuritySettings.passwordMinLength",
            "SecuritySettings.passwordRequireNumberOrSpecial",
            "SecuritySettings.maxFailedLoginAttempts",
            "SecuritySettings.lockoutMinutes",
            "SecuritySettings.sessionTtlDays",
            "SecuritySettings.allowExternalUsers",
            "SecuritySettings.createdAt",
            "SecuritySettings.updatedAt"
          ],
          presentPrimaryKeys: ["SecuritySettings_pkey"]
        })
      ),
      "partial"
    );
  });

  it("blocks admin security baselining when Role.permissionsJson is missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260419120000_admin_roles_security"), {
          presentColumns: ["Role.permissionsJson"]
        })
      ),
      "partial"
    );
  });

  it("blocks baselining when required enum values are missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260422120000_project_status_submission_type"), {
          presentEnumValues: ["ProjectStatus.APPROVED"]
        })
      ),
      "partial"
    );
  });

  it("blocks baselining when required foreign keys are missing", () => {
    assert.equal(
      classify(
        without(fixtureFor("baseline-20260422120000_project_status_submission_type"), {
          presentForeignKeys: ["NotificationOutbox_recipientUserId_fkey"]
        })
      ),
      "partial"
    );
  });

  it("blocks the current baseline when a required current-schema column is missing even without legacy submission-profile objects", () => {
    assert.equal(
      classify(
        without(
          without(fixtureFor("baseline-20260422120000_project_status_submission_type"), {
            presentTables: ["SubmissionProfile", "ProjectSubmissionProfileAssignment"],
            presentColumns: [
              "SubmissionProfile.key",
              "SubmissionProfile.label",
              "SubmissionProfile.profileType",
              "SubmissionProfile.isActive",
              "SubmissionProfile.sortOrder",
              "SubmissionProfile.createdAt",
              "SubmissionProfile.updatedAt",
              "ProjectSubmissionProfileAssignment.projectId",
              "ProjectSubmissionProfileAssignment.profileKey",
              "ProjectSubmissionProfileAssignment.createdAt",
              "ProjectSubmissionProfileAssignment.updatedAt"
            ],
            presentEnumValues: ["SubmissionProfileType.BASE", "SubmissionProfileType.ADDON"],
            presentIndexes: [
              "SubmissionProfile_isActive_idx",
              "SubmissionProfile_profileType_sortOrder_idx",
              "ProjectSubmissionProfileAssignment_profileKey_idx"
            ],
            presentPrimaryKeys: [
              "SubmissionProfile_pkey",
              "ProjectSubmissionProfileAssignment_pkey"
            ],
            presentForeignKeys: [
              "ProjectSubmissionProfileAssignment_projectId_fkey",
              "ProjectSubmissionProfileAssignment_profileKey_fkey"
            ]
          }),
          {
            presentColumns: ["Project.submissionType"]
          }
        )
      ),
      "partial"
    );
  });

  it("still recognizes the exact historical submission-profile baseline", () => {
    assert.equal(
      classify(fixtureFor("baseline-20260418190000_project_submission_profiles")),
      "baseline-20260418190000_project_submission_profiles"
    );
  });

  it("classifies a partial historical submission-profile schema as unsafe", () => {
    const profileIntroduced = introducedFor("baseline-20260418190000_project_submission_profiles");
    assert.equal(
      classify(
        without(fixtureFromRequirements(profileIntroduced), {
          presentColumns: ["ProjectSubmissionProfileAssignment.profileKey"]
        })
      ),
      "partial"
    );
  });
});
