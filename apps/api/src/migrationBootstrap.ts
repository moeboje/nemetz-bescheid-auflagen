import { pathToFileURL } from "node:url";
import { prisma } from "./prisma.js";
import { loadConfig, loadProjectEnvFile } from "./config.js";

export type BootstrapMode =
  | "fresh"
  | "ready"
  | "baseline-20260418143000_schema_completion"
  | "baseline-20260418190000_project_submission_profiles"
  | "baseline-20260418223000_project_checklists"
  | "baseline-20260419120000_admin_roles_security"
  | "baseline-20260419153000_email_notifications_powerautomate_e1"
  | "baseline-20260420113000_email_notifications_powerautomate_e2_mvp"
  | "baseline-20260422120000_project_status_submission_type"
  | "baseline-20260429103000_obligation_recurrence_external_execution"
  | "partial";

type TableRow = {
  tableName: string;
};

type ColumnRow = {
  columnKey: string;
};

type EnumValueRow = {
  enumValue: string;
};

type IndexRow = {
  indexName: string;
  schemaName: string;
  tableName: string;
  columnNames: string[];
  isUnique: boolean;
  isPrimary: boolean;
  methodName: string;
  hasExpressions: boolean;
  isPartial: boolean;
};

type ConstraintRow = {
  constraintName: string;
  constraintType: "PRIMARY KEY" | "UNIQUE" | "FOREIGN KEY";
  schemaName: string;
  tableName: string;
  columnNames: string[];
  referencedSchemaName: string | null;
  referencedTableName: string | null;
  referencedColumnNames: string[];
  onDelete: ReferentialAction | null;
  onUpdate: ReferentialAction | null;
};

type CurrentSchemaRequirement = "current";
type ReferentialAction = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";

export type RequiredIndex = {
  schema: CurrentSchemaRequirement;
  name: string;
  table: string;
  columns: readonly string[];
  unique: boolean;
  primary: boolean;
  method: string;
};

export type RequiredKeyConstraint = {
  schema: CurrentSchemaRequirement;
  name: string;
  table: string;
  columns: readonly string[];
};

export type RequiredForeignKey = {
  schema: CurrentSchemaRequirement;
  name: string;
  table: string;
  columns: readonly string[];
  referencedSchema: CurrentSchemaRequirement;
  referencedTable: string;
  referencedColumns: readonly string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
};

export type InspectedIndex = {
  schemaName: string;
  name: string;
  table: string;
  columns: readonly string[];
  unique: boolean;
  primary: boolean;
  method: string;
  hasExpressions: boolean;
  isPartial: boolean;
};

export type InspectedKeyConstraint = {
  schemaName: string;
  name: string;
  type: "PRIMARY KEY" | "UNIQUE";
  table: string;
  columns: readonly string[];
};

export type InspectedForeignKey = {
  schemaName: string;
  name: string;
  table: string;
  columns: readonly string[];
  referencedSchemaName: string;
  referencedTable: string;
  referencedColumns: readonly string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
};

export type SchemaRequirements = {
  tables: readonly string[];
  columns: readonly string[];
  enumValues?: readonly string[];
  indexes?: readonly RequiredIndex[];
  primaryKeys?: readonly RequiredKeyConstraint[];
  uniqueConstraints?: readonly RequiredKeyConstraint[];
  foreignKeys?: readonly RequiredForeignKey[];
};

type BaselineStage = {
  mode: Exclude<BootstrapMode, "fresh" | "ready" | "partial">;
  requirements: SchemaRequirements;
  introduced: SchemaRequirements;
};

type SchemaInspectionInput = {
  schemaName?: string;
  tables: Iterable<string>;
  columns?: Iterable<string>;
  enumValues?: Iterable<string>;
  indexes?: Iterable<InspectedIndex>;
  primaryKeys?: Iterable<InspectedKeyConstraint>;
  uniqueConstraints?: Iterable<InspectedKeyConstraint>;
  foreignKeys?: Iterable<InspectedForeignKey>;
};

type SchemaInspection = {
  schemaName: string;
  tables: Set<string>;
  columns: Set<string>;
  enumValues: Set<string>;
  indexes: Map<string, InspectedIndex>;
  primaryKeys: Map<string, InspectedKeyConstraint>;
  uniqueConstraints: Map<string, InspectedKeyConstraint>;
  foreignKeys: Map<string, InspectedForeignKey>;
};

const defaultInspectionSchemaName = "public";

function index(
  name: string,
  table: string,
  columns: readonly string[],
  options: { unique?: boolean; primary?: boolean; method?: string } = {}
): RequiredIndex {
  return {
    schema: "current",
    name,
    table,
    columns,
    unique: options.unique ?? false,
    primary: options.primary ?? false,
    method: options.method ?? "btree"
  };
}

function primaryKey(
  name: string,
  table: string,
  columns: readonly string[]
): RequiredKeyConstraint {
  return {
    schema: "current",
    name,
    table,
    columns
  };
}

function foreignKey(
  name: string,
  table: string,
  columns: readonly string[],
  referencedTable: string,
  referencedColumns: readonly string[],
  actions: { onDelete: ReferentialAction; onUpdate: ReferentialAction }
): RequiredForeignKey {
  return {
    schema: "current",
    name,
    table,
    columns,
    referencedSchema: "current",
    referencedTable,
    referencedColumns,
    onDelete: actions.onDelete,
    onUpdate: actions.onUpdate
  };
}

const authAndAdminCoreRequirements = {
  tables: ["User", "Session", "PasswordResetToken", "AuditLog"],
  columns: [
    "User.id",
    "User.firstName",
    "User.lastName",
    "User.email",
    "User.phone",
    "User.role",
    "User.type",
    "User.isArchived",
    "User.passwordHash",
    "User.passwordUpdatedAt",
    "User.failedLoginCount",
    "User.lockedUntil",
    "User.lastLoginAt",
    "User.createdAt",
    "User.updatedAt",
    "User.titleOrPosition",
    "User.department",
    "User.externalCompany",
    "User.notes",
    "User.lastPasswordResetAt",
    "User.mustChangePassword",
    "User.invitedAt",
    "Session.id",
    "Session.userId",
    "Session.tokenHash",
    "Session.createdAt",
    "Session.expiresAt",
    "Session.revokedAt",
    "Session.ip",
    "Session.userAgent",
    "PasswordResetToken.id",
    "PasswordResetToken.userId",
    "PasswordResetToken.tokenHash",
    "PasswordResetToken.expiresAt",
    "PasswordResetToken.usedAt",
    "PasswordResetToken.createdAt",
    "AuditLog.id",
    "AuditLog.actorUserId",
    "AuditLog.targetUserId",
    "AuditLog.action",
    "AuditLog.ip",
    "AuditLog.userAgent",
    "AuditLog.metadataJson",
    "AuditLog.createdAt"
  ],
  indexes: [
    index("User_email_key", "User", ["email"], { unique: true }),
    index("User_isArchived_idx", "User", ["isArchived"]),
    index("User_role_idx", "User", ["role"]),
    index("User_type_idx", "User", ["type"]),
    index("Session_tokenHash_key", "Session", ["tokenHash"], { unique: true }),
    index("Session_userId_idx", "Session", ["userId"]),
    index("Session_expiresAt_idx", "Session", ["expiresAt"]),
    index("PasswordResetToken_tokenHash_key", "PasswordResetToken", ["tokenHash"], {
      unique: true
    }),
    index("PasswordResetToken_userId_idx", "PasswordResetToken", ["userId"]),
    index("PasswordResetToken_expiresAt_idx", "PasswordResetToken", ["expiresAt"]),
    index("AuditLog_actorUserId_idx", "AuditLog", ["actorUserId"]),
    index("AuditLog_targetUserId_idx", "AuditLog", ["targetUserId"]),
    index("AuditLog_action_idx", "AuditLog", ["action"]),
    index("AuditLog_createdAt_idx", "AuditLog", ["createdAt"])
  ],
  primaryKeys: [
    primaryKey("User_pkey", "User", ["id"]),
    primaryKey("Session_pkey", "Session", ["id"]),
    primaryKey("PasswordResetToken_pkey", "PasswordResetToken", ["id"]),
    primaryKey("AuditLog_pkey", "AuditLog", ["id"])
  ],
  foreignKeys: [
    foreignKey("Session_userId_fkey", "Session", ["userId"], "User", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    }),
    foreignKey(
      "PasswordResetToken_userId_fkey",
      "PasswordResetToken",
      ["userId"],
      "User",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    ),
    foreignKey("AuditLog_actorUserId_fkey", "AuditLog", ["actorUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey("AuditLog_targetUserId_fkey", "AuditLog", ["targetUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    })
  ]
} satisfies SchemaRequirements;

const mfaRequirements = {
  tables: ["MfaPending", "MfaChallenge"],
  columns: [
    "User.mfaEnabled",
    "User.mfaEnforced",
    "User.mfaTotpSecretEnc",
    "User.mfaVerifiedAt",
    "User.mfaRecoveryCodesHashJson",
    "MfaPending.id",
    "MfaPending.userId",
    "MfaPending.secretEnc",
    "MfaPending.expiresAt",
    "MfaPending.createdAt",
    "MfaChallenge.id",
    "MfaChallenge.userId",
    "MfaChallenge.tokenHash",
    "MfaChallenge.expiresAt",
    "MfaChallenge.ipHash",
    "MfaChallenge.uaHash",
    "MfaChallenge.createdAt"
  ],
  indexes: [
    index("MfaChallenge_tokenHash_key", "MfaChallenge", ["tokenHash"], { unique: true }),
    index("MfaPending_userId_idx", "MfaPending", ["userId"]),
    index("MfaPending_expiresAt_idx", "MfaPending", ["expiresAt"]),
    index("MfaChallenge_userId_idx", "MfaChallenge", ["userId"]),
    index("MfaChallenge_expiresAt_idx", "MfaChallenge", ["expiresAt"])
  ],
  primaryKeys: [
    primaryKey("MfaPending_pkey", "MfaPending", ["id"]),
    primaryKey("MfaChallenge_pkey", "MfaChallenge", ["id"])
  ],
  foreignKeys: [
    foreignKey("MfaPending_userId_fkey", "MfaPending", ["userId"], "User", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    }),
    foreignKey("MfaChallenge_userId_fkey", "MfaChallenge", ["userId"], "User", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    })
  ]
} satisfies SchemaRequirements;

const rolesAndExternalOrganizationsRequirements = {
  tables: ["Role", "ExternalOrganization"],
  columns: [
    "Role.id",
    "Role.key",
    "Role.labelDe",
    "Role.descriptionDe",
    "Role.isSystem",
    "Role.isArchived",
    "Role.createdAt",
    "Role.updatedAt",
    "ExternalOrganization.id",
    "ExternalOrganization.name",
    "ExternalOrganization.type",
    "ExternalOrganization.phone",
    "ExternalOrganization.email",
    "ExternalOrganization.address",
    "ExternalOrganization.isArchived",
    "ExternalOrganization.createdAt",
    "ExternalOrganization.updatedAt",
    "User.externalOrgId"
  ],
  indexes: [
    index("Role_key_key", "Role", ["key"], { unique: true }),
    index("Role_isArchived_idx", "Role", ["isArchived"]),
    index("Role_labelDe_idx", "Role", ["labelDe"]),
    index("ExternalOrganization_isArchived_idx", "ExternalOrganization", ["isArchived"]),
    index("ExternalOrganization_name_idx", "ExternalOrganization", ["name"]),
    index("User_externalOrgId_idx", "User", ["externalOrgId"])
  ],
  primaryKeys: [
    primaryKey("Role_pkey", "Role", ["id"]),
    primaryKey("ExternalOrganization_pkey", "ExternalOrganization", ["id"])
  ],
  foreignKeys: [
    foreignKey("User_externalOrgId_fkey", "User", ["externalOrgId"], "ExternalOrganization", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    })
  ]
} satisfies SchemaRequirements;

const documentsRequirements = {
  tables: ["Document"],
  columns: [
    "Document.id",
    "Document.ownerType",
    "Document.ownerId",
    "Document.filename",
    "Document.originalFilename",
    "Document.mimeType",
    "Document.sizeBytes",
    "Document.storagePath",
    "Document.sha256",
    "Document.isArchived",
    "Document.createdByUserId",
    "Document.createdAt",
    "Document.updatedAt"
  ],
  indexes: [
    index("Document_ownerType_ownerId_idx", "Document", ["ownerType", "ownerId"]),
    index("Document_createdAt_idx", "Document", ["createdAt"])
  ],
  primaryKeys: [primaryKey("Document_pkey", "Document", ["id"])],
  foreignKeys: [
    foreignKey("Document_createdByUserId_fkey", "Document", ["createdByUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    })
  ]
} satisfies SchemaRequirements;

const commentsRequirements = {
  tables: ["Comment", "CommentRevision"],
  columns: [
    "Comment.id",
    "Comment.entityType",
    "Comment.entityId",
    "Comment.authorUserId",
    "Comment.body",
    "Comment.createdAt",
    "Comment.updatedAt",
    "Comment.isEdited",
    "Comment.editedAt",
    "Comment.editedByUserId",
    "Comment.deletedAt",
    "Comment.deletedByUserId",
    "CommentRevision.id",
    "CommentRevision.commentId",
    "CommentRevision.revisionNo",
    "CommentRevision.body",
    "CommentRevision.createdAt",
    "CommentRevision.createdByUserId"
  ],
  indexes: [
    index("Comment_entityType_entityId_idx", "Comment", ["entityType", "entityId"]),
    index("Comment_authorUserId_idx", "Comment", ["authorUserId"]),
    index("Comment_deletedAt_idx", "Comment", ["deletedAt"]),
    index("CommentRevision_commentId_revisionNo_key", "CommentRevision", [
      "commentId",
      "revisionNo"
    ], { unique: true }),
    index("CommentRevision_commentId_idx", "CommentRevision", ["commentId"])
  ],
  primaryKeys: [
    primaryKey("Comment_pkey", "Comment", ["id"]),
    primaryKey("CommentRevision_pkey", "CommentRevision", ["id"])
  ],
  foreignKeys: [
    foreignKey(
      "CommentRevision_commentId_fkey",
      "CommentRevision",
      ["commentId"],
      "Comment",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const scopesAndAuthoritiesRequirements = {
  tables: ["Company", "Site", "Facility", "Authority", "AuthorityContact"],
  columns: [
    "Company.id",
    "Company.name",
    "Company.shortName",
    "Company.isArchived",
    "Company.createdAt",
    "Company.updatedAt",
    "Site.id",
    "Site.companyId",
    "Site.name",
    "Site.isArchived",
    "Site.createdAt",
    "Site.updatedAt",
    "Facility.id",
    "Facility.companyId",
    "Facility.siteId",
    "Facility.name",
    "Facility.type",
    "Facility.isArchived",
    "Facility.createdAt",
    "Facility.updatedAt",
    "Authority.id",
    "Authority.name",
    "Authority.shortName",
    "Authority.isArchived",
    "Authority.createdAt",
    "Authority.updatedAt",
    "AuthorityContact.id",
    "AuthorityContact.authorityId",
    "AuthorityContact.name",
    "AuthorityContact.email",
    "AuthorityContact.phone",
    "AuthorityContact.roleTitle",
    "AuthorityContact.isArchived",
    "AuthorityContact.createdAt",
    "AuthorityContact.updatedAt"
  ],
  indexes: [
    index("Company_isArchived_idx", "Company", ["isArchived"]),
    index("Site_companyId_idx", "Site", ["companyId"]),
    index("Site_isArchived_idx", "Site", ["isArchived"]),
    index("Facility_companyId_idx", "Facility", ["companyId"]),
    index("Facility_siteId_idx", "Facility", ["siteId"]),
    index("Facility_isArchived_idx", "Facility", ["isArchived"]),
    index("Authority_isArchived_idx", "Authority", ["isArchived"]),
    index("AuthorityContact_authorityId_idx", "AuthorityContact", ["authorityId"]),
    index("AuthorityContact_isArchived_idx", "AuthorityContact", ["isArchived"])
  ],
  primaryKeys: [
    primaryKey("Company_pkey", "Company", ["id"]),
    primaryKey("Site_pkey", "Site", ["id"]),
    primaryKey("Facility_pkey", "Facility", ["id"]),
    primaryKey("Authority_pkey", "Authority", ["id"]),
    primaryKey("AuthorityContact_pkey", "AuthorityContact", ["id"])
  ],
  foreignKeys: [
    foreignKey("Site_companyId_fkey", "Site", ["companyId"], "Company", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    }),
    foreignKey("Facility_companyId_fkey", "Facility", ["companyId"], "Company", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    }),
    foreignKey("Facility_siteId_fkey", "Facility", ["siteId"], "Site", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    }),
    foreignKey(
      "AuthorityContact_authorityId_fkey",
      "AuthorityContact",
      ["authorityId"],
      "Authority",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const projectsRequirements = {
  tables: ["Project"],
  columns: [
    "Project.id",
    "Project.title",
    "Project.shortDescription",
    "Project.authorityRef",
    "Project.companyId",
    "Project.siteId",
    "Project.facilityId",
    "Project.authorityId",
    "Project.authorityContactId",
    "Project.ownerUserId",
    "Project.deputyUserId",
    "Project.participantUserIds",
    "Project.internalParticipants",
    "Project.externalParticipants",
    "Project.attachments",
    "Project.dependsOnProjectIds",
    "Project.referenceLegalDocIds",
    "Project.archivedAt",
    "Project.isArchived",
    "Project.createdAt",
    "Project.updatedAt"
  ],
  indexes: [
    index("Project_companyId_idx", "Project", ["companyId"]),
    index("Project_siteId_idx", "Project", ["siteId"]),
    index("Project_facilityId_idx", "Project", ["facilityId"]),
    index("Project_authorityId_idx", "Project", ["authorityId"]),
    index("Project_authorityContactId_idx", "Project", ["authorityContactId"]),
    index("Project_ownerUserId_idx", "Project", ["ownerUserId"]),
    index("Project_deputyUserId_idx", "Project", ["deputyUserId"]),
    index("Project_isArchived_idx", "Project", ["isArchived"])
  ],
  primaryKeys: [primaryKey("Project_pkey", "Project", ["id"])],
  foreignKeys: [
    foreignKey("Project_companyId_fkey", "Project", ["companyId"], "Company", ["id"], {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE"
    }),
    foreignKey("Project_siteId_fkey", "Project", ["siteId"], "Site", ["id"], {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE"
    }),
    foreignKey("Project_facilityId_fkey", "Project", ["facilityId"], "Facility", ["id"], {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE"
    }),
    foreignKey("Project_authorityId_fkey", "Project", ["authorityId"], "Authority", ["id"], {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE"
    }),
    foreignKey(
      "Project_authorityContactId_fkey",
      "Project",
      ["authorityContactId"],
      "AuthorityContact",
      ["id"],
      { onDelete: "RESTRICT", onUpdate: "CASCADE" }
    ),
    foreignKey("Project_ownerUserId_fkey", "Project", ["ownerUserId"], "User", ["id"], {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE"
    }),
    foreignKey("Project_deputyUserId_fkey", "Project", ["deputyUserId"], "User", ["id"], {
      onDelete: "RESTRICT",
      onUpdate: "CASCADE"
    })
  ]
} satisfies SchemaRequirements;

const taskStateRequirements = {
  tables: ["TaskStateEntry"],
  columns: [
    "TaskStateEntry.taskInstanceId",
    "TaskStateEntry.status",
    "TaskStateEntry.completedAt",
    "TaskStateEntry.completedByUserId",
    "TaskStateEntry.completedByLabel",
    "TaskStateEntry.evidence",
    "TaskStateEntry.createdAt",
    "TaskStateEntry.updatedAt"
  ],
  indexes: [
    index("TaskStateEntry_completedByUserId_idx", "TaskStateEntry", ["completedByUserId"]),
    index("TaskStateEntry_status_idx", "TaskStateEntry", ["status"]),
    index("TaskStateEntry_updatedAt_idx", "TaskStateEntry", ["updatedAt"])
  ],
  primaryKeys: [primaryKey("TaskStateEntry_pkey", "TaskStateEntry", ["taskInstanceId"])],
  foreignKeys: [
    foreignKey(
      "TaskStateEntry_completedByUserId_fkey",
      "TaskStateEntry",
      ["completedByUserId"],
      "User",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const schemaCompletionRequirements = {
  tables: ["LegalDocument", "Obligation", "Deadline", "PortalSnapshot"],
  columns: [
    "AuthorityContact.firstName",
    "AuthorityContact.lastName",
    "AuthorityContact.mobile",
    "AuthorityContact.notes",
    "AuthorityContact.department",
    "AuthorityContact.isPrimary",
    "LegalDocument.id",
    "LegalDocument.projectId",
    "LegalDocument.type",
    "LegalDocument.title",
    "LegalDocument.shortDescription",
    "LegalDocument.reference",
    "LegalDocument.issuedAt",
    "LegalDocument.authorityId",
    "LegalDocument.authorityContactId",
    "LegalDocument.attachments",
    "LegalDocument.aiExtraction",
    "LegalDocument.scopeOverride",
    "LegalDocument.archivedAt",
    "LegalDocument.isArchived",
    "LegalDocument.createdAt",
    "LegalDocument.updatedAt",
    "Obligation.id",
    "Obligation.legalDocId",
    "Obligation.title",
    "Obligation.infoTextLong",
    "Obligation.level",
    "Obligation.criticality",
    "Obligation.scheduleType",
    "Obligation.firstDueDate",
    "Obligation.intervalUnit",
    "Obligation.intervalValue",
    "Obligation.ownerUserId",
    "Obligation.deputyUserId",
    "Obligation.origin",
    "Obligation.sourceSuggestionId",
    "Obligation.sourceRunId",
    "Obligation.emailReminderEnabled",
    "Obligation.emailReminderDaysBefore",
    "Obligation.evidenceRequirements",
    "Obligation.archivedAt",
    "Obligation.isArchived",
    "Obligation.createdAt",
    "Obligation.updatedAt",
    "Deadline.id",
    "Deadline.title",
    "Deadline.description",
    "Deadline.dueDate",
    "Deadline.status",
    "Deadline.projectId",
    "Deadline.legalDocId",
    "Deadline.authorityId",
    "Deadline.ownerUserId",
    "Deadline.deputyUserId",
    "Deadline.emailReminderEnabled",
    "Deadline.emailReminderDaysBefore",
    "Deadline.completedAt",
    "Deadline.completedByUserId",
    "Deadline.evidence",
    "Deadline.archivedAt",
    "Deadline.isArchived",
    "Deadline.createdAt",
    "Deadline.updatedAt",
    "PortalSnapshot.id",
    "PortalSnapshot.scopeKey",
    "PortalSnapshot.payload",
    "PortalSnapshot.updatedByUserId",
    "PortalSnapshot.createdAt",
    "PortalSnapshot.updatedAt"
  ],
  indexes: [
    index("LegalDocument_projectId_idx", "LegalDocument", ["projectId"]),
    index("LegalDocument_authorityId_idx", "LegalDocument", ["authorityId"]),
    index("LegalDocument_authorityContactId_idx", "LegalDocument", ["authorityContactId"]),
    index("LegalDocument_isArchived_idx", "LegalDocument", ["isArchived"]),
    index("Obligation_legalDocId_idx", "Obligation", ["legalDocId"]),
    index("Obligation_ownerUserId_idx", "Obligation", ["ownerUserId"]),
    index("Obligation_deputyUserId_idx", "Obligation", ["deputyUserId"]),
    index("Obligation_isArchived_idx", "Obligation", ["isArchived"]),
    index("Deadline_projectId_idx", "Deadline", ["projectId"]),
    index("Deadline_legalDocId_idx", "Deadline", ["legalDocId"]),
    index("Deadline_authorityId_idx", "Deadline", ["authorityId"]),
    index("Deadline_ownerUserId_idx", "Deadline", ["ownerUserId"]),
    index("Deadline_deputyUserId_idx", "Deadline", ["deputyUserId"]),
    index("Deadline_completedByUserId_idx", "Deadline", ["completedByUserId"]),
    index("Deadline_status_idx", "Deadline", ["status"]),
    index("Deadline_dueDate_idx", "Deadline", ["dueDate"]),
    index("Deadline_isArchived_idx", "Deadline", ["isArchived"]),
    index("PortalSnapshot_scopeKey_key", "PortalSnapshot", ["scopeKey"], { unique: true })
  ],
  primaryKeys: [
    primaryKey("LegalDocument_pkey", "LegalDocument", ["id"]),
    primaryKey("Obligation_pkey", "Obligation", ["id"]),
    primaryKey("Deadline_pkey", "Deadline", ["id"]),
    primaryKey("PortalSnapshot_pkey", "PortalSnapshot", ["id"])
  ],
  foreignKeys: [
    foreignKey("LegalDocument_projectId_fkey", "LegalDocument", ["projectId"], "Project", ["id"], {
      onDelete: "CASCADE",
      onUpdate: "CASCADE"
    }),
    foreignKey(
      "LegalDocument_authorityId_fkey",
      "LegalDocument",
      ["authorityId"],
      "Authority",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    ),
    foreignKey(
      "LegalDocument_authorityContactId_fkey",
      "LegalDocument",
      ["authorityContactId"],
      "AuthorityContact",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    ),
    foreignKey(
      "Obligation_legalDocId_fkey",
      "Obligation",
      ["legalDocId"],
      "LegalDocument",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    ),
    foreignKey("Obligation_ownerUserId_fkey", "Obligation", ["ownerUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey("Obligation_deputyUserId_fkey", "Obligation", ["deputyUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey("Deadline_projectId_fkey", "Deadline", ["projectId"], "Project", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey(
      "Deadline_legalDocId_fkey",
      "Deadline",
      ["legalDocId"],
      "LegalDocument",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    ),
    foreignKey("Deadline_authorityId_fkey", "Deadline", ["authorityId"], "Authority", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey("Deadline_ownerUserId_fkey", "Deadline", ["ownerUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey("Deadline_deputyUserId_fkey", "Deadline", ["deputyUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    }),
    foreignKey(
      "Deadline_completedByUserId_fkey",
      "Deadline",
      ["completedByUserId"],
      "User",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const projectSubmissionProfileRequirements = {
  tables: ["SubmissionProfile", "ProjectSubmissionProfileAssignment"],
  columns: [
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
  enumValues: ["SubmissionProfileType.BASE", "SubmissionProfileType.ADDON"],
  indexes: [
    index("SubmissionProfile_isActive_idx", "SubmissionProfile", ["isActive"]),
    index("SubmissionProfile_profileType_sortOrder_idx", "SubmissionProfile", [
      "profileType",
      "sortOrder"
    ]),
    index("ProjectSubmissionProfileAssignment_profileKey_idx", "ProjectSubmissionProfileAssignment", [
      "profileKey"
    ])
  ],
  primaryKeys: [
    primaryKey("SubmissionProfile_pkey", "SubmissionProfile", ["key"]),
    primaryKey("ProjectSubmissionProfileAssignment_pkey", "ProjectSubmissionProfileAssignment", [
      "projectId",
      "profileKey"
    ])
  ],
  foreignKeys: [
    foreignKey(
      "ProjectSubmissionProfileAssignment_projectId_fkey",
      "ProjectSubmissionProfileAssignment",
      ["projectId"],
      "Project",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    ),
    foreignKey(
      "ProjectSubmissionProfileAssignment_profileKey_fkey",
      "ProjectSubmissionProfileAssignment",
      ["profileKey"],
      "SubmissionProfile",
      ["key"],
      { onDelete: "RESTRICT", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const projectChecklistRequirements = {
  tables: ["ProjectChecklist", "ProjectChecklistSection", "ProjectChecklistItem"],
  columns: [
    "ProjectChecklist.id",
    "ProjectChecklist.projectId",
    "ProjectChecklist.createdAt",
    "ProjectChecklist.updatedAt",
    "ProjectChecklistSection.id",
    "ProjectChecklistSection.projectChecklistId",
    "ProjectChecklistSection.title",
    "ProjectChecklistSection.description",
    "ProjectChecklistSection.sortOrder",
    "ProjectChecklistSection.createdAt",
    "ProjectChecklistSection.updatedAt",
    "ProjectChecklistItem.id",
    "ProjectChecklistItem.projectChecklistSectionId",
    "ProjectChecklistItem.title",
    "ProjectChecklistItem.description",
    "ProjectChecklistItem.status",
    "ProjectChecklistItem.sortOrder",
    "ProjectChecklistItem.createdAt",
    "ProjectChecklistItem.updatedAt"
  ],
  enumValues: [
    "ChecklistItemStatus.OPEN",
    "ChecklistItemStatus.IN_PROGRESS",
    "ChecklistItemStatus.DONE",
    "ChecklistItemStatus.NOT_REQUIRED"
  ],
  indexes: [
    index("ProjectChecklist_projectId_key", "ProjectChecklist", ["projectId"], { unique: true }),
    index(
      "ProjectChecklistSection_projectChecklistId_sortOrder_idx",
      "ProjectChecklistSection",
      ["projectChecklistId", "sortOrder"]
    ),
    index(
      "ProjectChecklistItem_projectChecklistSectionId_sortOrder_idx",
      "ProjectChecklistItem",
      ["projectChecklistSectionId", "sortOrder"]
    )
  ],
  primaryKeys: [
    primaryKey("ProjectChecklist_pkey", "ProjectChecklist", ["id"]),
    primaryKey("ProjectChecklistSection_pkey", "ProjectChecklistSection", ["id"]),
    primaryKey("ProjectChecklistItem_pkey", "ProjectChecklistItem", ["id"])
  ],
  foreignKeys: [
    foreignKey("ProjectChecklist_projectId_fkey", "ProjectChecklist", ["projectId"], "Project", [
      "id"
    ], { onDelete: "CASCADE", onUpdate: "CASCADE" }),
    foreignKey(
      "ProjectChecklistSection_projectChecklistId_fkey",
      "ProjectChecklistSection",
      ["projectChecklistId"],
      "ProjectChecklist",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    ),
    foreignKey(
      "ProjectChecklistItem_projectChecklistSectionId_fkey",
      "ProjectChecklistItem",
      ["projectChecklistSectionId"],
      "ProjectChecklistSection",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const adminSecurityRequirements = {
  tables: ["SecuritySettings"],
  columns: [
    "Role.permissionsJson",
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
  primaryKeys: [primaryKey("SecuritySettings_pkey", "SecuritySettings", ["id"])]
} satisfies SchemaRequirements;

const notificationE1Requirements = {
  tables: ["NotificationOutbox"],
  columns: [
    "NotificationOutbox.id",
    "NotificationOutbox.eventType",
    "NotificationOutbox.entityType",
    "NotificationOutbox.entityId",
    "NotificationOutbox.recipientUserId",
    "NotificationOutbox.recipientEmail",
    "NotificationOutbox.recipientName",
    "NotificationOutbox.subject",
    "NotificationOutbox.payloadJson",
    "NotificationOutbox.status",
    "NotificationOutbox.scheduledFor",
    "NotificationOutbox.claimedAt",
    "NotificationOutbox.claimToken",
    "NotificationOutbox.sentAt",
    "NotificationOutbox.attemptCount",
    "NotificationOutbox.lastAttemptAt",
    "NotificationOutbox.lastError",
    "NotificationOutbox.providerReference",
    "NotificationOutbox.idempotencyKey",
    "NotificationOutbox.createdAt",
    "NotificationOutbox.updatedAt"
  ],
  indexes: [
    index("NotificationOutbox_idempotencyKey_key", "NotificationOutbox", ["idempotencyKey"], {
      unique: true
    }),
    index("NotificationOutbox_status_scheduledFor_idx", "NotificationOutbox", [
      "status",
      "scheduledFor"
    ]),
    index("NotificationOutbox_claimedAt_idx", "NotificationOutbox", ["claimedAt"]),
    index("NotificationOutbox_recipientUserId_createdAt_idx", "NotificationOutbox", [
      "recipientUserId",
      "createdAt"
    ]),
    index("NotificationOutbox_entityType_entityId_idx", "NotificationOutbox", [
      "entityType",
      "entityId"
    ])
  ],
  primaryKeys: [primaryKey("NotificationOutbox_pkey", "NotificationOutbox", ["id"])],
  foreignKeys: [
    foreignKey(
      "NotificationOutbox_recipientUserId_fkey",
      "NotificationOutbox",
      ["recipientUserId"],
      "User",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const notificationE2Requirements = {
  tables: [
    "NotificationDeliveryAttempt",
    "NotificationSettings",
    "NotificationWorkerStatus"
  ],
  columns: [
    "NotificationDeliveryAttempt.id",
    "NotificationDeliveryAttempt.notificationId",
    "NotificationDeliveryAttempt.attemptNumber",
    "NotificationDeliveryAttempt.outcome",
    "NotificationDeliveryAttempt.startedAt",
    "NotificationDeliveryAttempt.finishedAt",
    "NotificationDeliveryAttempt.httpStatus",
    "NotificationDeliveryAttempt.errorSummary",
    "NotificationDeliveryAttempt.providerReference",
    "NotificationDeliveryAttempt.triggeredByUserId",
    "NotificationDeliveryAttempt.createdAt",
    "NotificationSettings.id",
    "NotificationSettings.defaultDueSoonDays",
    "NotificationSettings.deadlineDueSoonEnabled",
    "NotificationSettings.assignmentAssignedEnabled",
    "NotificationSettings.dailyDigestEnabled",
    "NotificationSettings.weeklyDigestEnabled",
    "NotificationSettings.dailyDigestHourLocal",
    "NotificationSettings.weeklyDigestWeekday",
    "NotificationSettings.createdAt",
    "NotificationSettings.updatedAt",
    "NotificationWorkerStatus.workerKey",
    "NotificationWorkerStatus.lastStartedAt",
    "NotificationWorkerStatus.lastFinishedAt",
    "NotificationWorkerStatus.lastSuccessfulAt",
    "NotificationWorkerStatus.lastOutcome",
    "NotificationWorkerStatus.lastError",
    "NotificationWorkerStatus.lastClaimedCount",
    "NotificationWorkerStatus.lastProcessedCount",
    "NotificationWorkerStatus.createdAt",
    "NotificationWorkerStatus.updatedAt"
  ],
  indexes: [
    index(
      "NotificationDeliveryAttempt_notificationId_createdAt_idx",
      "NotificationDeliveryAttempt",
      ["notificationId", "createdAt"]
    ),
    index(
      "NotificationDeliveryAttempt_outcome_createdAt_idx",
      "NotificationDeliveryAttempt",
      ["outcome", "createdAt"]
    ),
    index("NotificationDeliveryAttempt_triggeredByUserId_idx", "NotificationDeliveryAttempt", [
      "triggeredByUserId"
    ])
  ],
  primaryKeys: [
    primaryKey("NotificationDeliveryAttempt_pkey", "NotificationDeliveryAttempt", ["id"]),
    primaryKey("NotificationSettings_pkey", "NotificationSettings", ["id"]),
    primaryKey("NotificationWorkerStatus_pkey", "NotificationWorkerStatus", ["workerKey"])
  ],
  foreignKeys: [
    foreignKey(
      "NotificationDeliveryAttempt_notificationId_fkey",
      "NotificationDeliveryAttempt",
      ["notificationId"],
      "NotificationOutbox",
      ["id"],
      { onDelete: "CASCADE", onUpdate: "CASCADE" }
    ),
    foreignKey(
      "NotificationDeliveryAttempt_triggeredByUserId_fkey",
      "NotificationDeliveryAttempt",
      ["triggeredByUserId"],
      "User",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    )
  ]
} satisfies SchemaRequirements;

const projectStatusSubmissionTypeRequirements = {
  tables: [],
  columns: ["Project.status", "Project.submissionType"],
  enumValues: [
    "ProjectStatus.DRAFT",
    "ProjectStatus.INTERNAL_REVIEW",
    "ProjectStatus.SUBMISSION_PREPARATION",
    "ProjectStatus.UVP_PREPARATION",
    "ProjectStatus.SUBMITTED",
    "ProjectStatus.ADDITIONAL_INFORMATION_REQUEST",
    "ProjectStatus.APPROVED",
    "ProjectStatus.IN_IMPLEMENTATION",
    "ProjectSubmissionType.GEWERBE",
    "ProjectSubmissionType.AWG",
    "ProjectSubmissionType.UVP_UVE"
  ],
  indexes: [index("Project_submissionType_idx", "Project", ["submissionType"])]
} satisfies SchemaRequirements;

const obligationExternalRecurrenceRequirements = {
  tables: [],
  columns: [
    "Obligation.recurrenceEndDate",
    "Obligation.externalOrgId",
    "Obligation.externalUserId"
  ],
  indexes: [
    index("Obligation_externalOrgId_idx", "Obligation", ["externalOrgId"]),
    index("Obligation_externalUserId_idx", "Obligation", ["externalUserId"])
  ],
  foreignKeys: [
    foreignKey(
      "Obligation_externalOrgId_fkey",
      "Obligation",
      ["externalOrgId"],
      "ExternalOrganization",
      ["id"],
      { onDelete: "SET NULL", onUpdate: "CASCADE" }
    ),
    foreignKey("Obligation_externalUserId_fkey", "Obligation", ["externalUserId"], "User", ["id"], {
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    })
  ]
} satisfies SchemaRequirements;

function mergeRequirements(...requirements: SchemaRequirements[]): SchemaRequirements {
  return {
    tables: requirements.flatMap((requirement) => requirement.tables),
    columns: requirements.flatMap((requirement) => requirement.columns),
    enumValues: requirements.flatMap((requirement) => requirement.enumValues ?? []),
    indexes: requirements.flatMap((requirement) => requirement.indexes ?? []),
    primaryKeys: requirements.flatMap((requirement) => requirement.primaryKeys ?? []),
    uniqueConstraints: requirements.flatMap((requirement) => requirement.uniqueConstraints ?? []),
    foreignKeys: requirements.flatMap((requirement) => requirement.foreignKeys ?? [])
  };
}

const schemaCompletionBaselineRequirements = mergeRequirements(
  authAndAdminCoreRequirements,
  mfaRequirements,
  rolesAndExternalOrganizationsRequirements,
  documentsRequirements,
  commentsRequirements,
  scopesAndAuthoritiesRequirements,
  projectsRequirements,
  taskStateRequirements,
  schemaCompletionRequirements
);

const projectStatusSubmissionTypeBaselineRequirements = mergeRequirements(
  schemaCompletionBaselineRequirements,
  projectChecklistRequirements,
  adminSecurityRequirements,
  notificationE1Requirements,
  notificationE2Requirements,
  projectStatusSubmissionTypeRequirements
);

export const baselineStages = [
  {
    mode: "baseline-20260429103000_obligation_recurrence_external_execution",
    introduced: obligationExternalRecurrenceRequirements,
    requirements: mergeRequirements(
      projectStatusSubmissionTypeBaselineRequirements,
      obligationExternalRecurrenceRequirements
    )
  },
  {
    mode: "baseline-20260422120000_project_status_submission_type",
    introduced: projectStatusSubmissionTypeRequirements,
    requirements: projectStatusSubmissionTypeBaselineRequirements
  },
  {
    mode: "baseline-20260420113000_email_notifications_powerautomate_e2_mvp",
    introduced: notificationE2Requirements,
    requirements: mergeRequirements(
      schemaCompletionBaselineRequirements,
      projectChecklistRequirements,
      adminSecurityRequirements,
      notificationE1Requirements,
      notificationE2Requirements
    )
  },
  {
    mode: "baseline-20260419153000_email_notifications_powerautomate_e1",
    introduced: notificationE1Requirements,
    requirements: mergeRequirements(
      schemaCompletionBaselineRequirements,
      projectChecklistRequirements,
      adminSecurityRequirements,
      notificationE1Requirements
    )
  },
  {
    mode: "baseline-20260419120000_admin_roles_security",
    introduced: adminSecurityRequirements,
    requirements: mergeRequirements(
      schemaCompletionBaselineRequirements,
      projectChecklistRequirements,
      adminSecurityRequirements
    )
  },
  {
    mode: "baseline-20260418223000_project_checklists",
    introduced: projectChecklistRequirements,
    requirements: mergeRequirements(
      schemaCompletionBaselineRequirements,
      projectChecklistRequirements
    )
  },
  {
    mode: "baseline-20260418190000_project_submission_profiles",
    introduced: projectSubmissionProfileRequirements,
    requirements: mergeRequirements(
      schemaCompletionBaselineRequirements,
      projectSubmissionProfileRequirements
    )
  },
  {
    mode: "baseline-20260418143000_schema_completion",
    introduced: schemaCompletionBaselineRequirements,
    requirements: schemaCompletionBaselineRequirements
  }
] as const satisfies readonly BaselineStage[];

function toInspection(input: SchemaInspectionInput): SchemaInspection {
  return {
    schemaName: input.schemaName ?? defaultInspectionSchemaName,
    tables: new Set(input.tables),
    columns: new Set(input.columns ?? []),
    enumValues: new Set(input.enumValues ?? []),
    indexes: toDefinitionMap(input.indexes),
    primaryKeys: toDefinitionMap(input.primaryKeys),
    uniqueConstraints: toDefinitionMap(input.uniqueConstraints),
    foreignKeys: toDefinitionMap(input.foreignKeys)
  };
}

function toDefinitionMap<T extends { name: string }>(definitions?: Iterable<T>) {
  return new Map(Array.from(definitions ?? [], (definition) => [definition.name, definition]));
}

function sameColumns(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((columnName, index) => columnName === expected[index])
  );
}

function isCurrentSchema(inspection: SchemaInspection, schemaName: string) {
  return schemaName === inspection.schemaName;
}

function hasIndexRequirement(inspection: SchemaInspection, requirement: RequiredIndex) {
  const actual = inspection.indexes.get(requirement.name);
  return (
    actual !== undefined &&
    isCurrentSchema(inspection, actual.schemaName) &&
    actual.table === requirement.table &&
    sameColumns(actual.columns, requirement.columns) &&
    actual.unique === requirement.unique &&
    actual.primary === requirement.primary &&
    actual.method === requirement.method &&
    !actual.hasExpressions &&
    !actual.isPartial
  );
}

function hasKeyRequirement(
  inspection: SchemaInspection,
  map: ReadonlyMap<string, InspectedKeyConstraint>,
  requirement: RequiredKeyConstraint,
  expectedType: "PRIMARY KEY" | "UNIQUE"
) {
  const actual = map.get(requirement.name);
  return (
    actual !== undefined &&
    isCurrentSchema(inspection, actual.schemaName) &&
    actual.type === expectedType &&
    actual.table === requirement.table &&
    sameColumns(actual.columns, requirement.columns)
  );
}

function hasForeignKeyRequirement(inspection: SchemaInspection, requirement: RequiredForeignKey) {
  const actual = inspection.foreignKeys.get(requirement.name);
  return (
    actual !== undefined &&
    isCurrentSchema(inspection, actual.schemaName) &&
    isCurrentSchema(inspection, actual.referencedSchemaName) &&
    actual.table === requirement.table &&
    sameColumns(actual.columns, requirement.columns) &&
    actual.referencedTable === requirement.referencedTable &&
    sameColumns(actual.referencedColumns, requirement.referencedColumns) &&
    (requirement.onDelete === undefined || actual.onDelete === requirement.onDelete) &&
    (requirement.onUpdate === undefined || actual.onUpdate === requirement.onUpdate)
  );
}

function hasEveryRequirement(inspection: SchemaInspection, requirements: SchemaRequirements) {
  return (
    requirements.tables.every((tableName) => inspection.tables.has(tableName)) &&
    requirements.columns.every((columnKey) => inspection.columns.has(columnKey)) &&
    (requirements.enumValues ?? []).every((enumValue) => inspection.enumValues.has(enumValue)) &&
    (requirements.indexes ?? []).every((requirement) =>
      hasIndexRequirement(inspection, requirement)
    ) &&
    (requirements.primaryKeys ?? []).every((requirement) =>
      hasKeyRequirement(inspection, inspection.primaryKeys, requirement, "PRIMARY KEY")
    ) &&
    (requirements.uniqueConstraints ?? []).every((requirement) =>
      hasKeyRequirement(inspection, inspection.uniqueConstraints, requirement, "UNIQUE")
    ) &&
    (requirements.foreignKeys ?? []).every((requirement) =>
      hasForeignKeyRequirement(inspection, requirement)
    )
  );
}

function hasAnyRequirement(inspection: SchemaInspection, requirements: SchemaRequirements) {
  return (
    requirements.tables.some((tableName) => inspection.tables.has(tableName)) ||
    requirements.columns.some((columnKey) => inspection.columns.has(columnKey)) ||
    (requirements.enumValues ?? []).some((enumValue) => inspection.enumValues.has(enumValue)) ||
    (requirements.indexes ?? []).some((requirement) => inspection.indexes.has(requirement.name)) ||
    (requirements.primaryKeys ?? []).some((requirement) =>
      inspection.primaryKeys.has(requirement.name)
    ) ||
    (requirements.uniqueConstraints ?? []).some((requirement) =>
      inspection.uniqueConstraints.has(requirement.name)
    ) ||
    (requirements.foreignKeys ?? []).some((requirement) =>
      inspection.foreignKeys.has(requirement.name)
    )
  );
}

function isEmptyInspection(inspection: SchemaInspection) {
  return (
    inspection.tables.size === 0 &&
    inspection.columns.size === 0 &&
    inspection.enumValues.size === 0 &&
    inspection.indexes.size === 0 &&
    inspection.primaryKeys.size === 0 &&
    inspection.uniqueConstraints.size === 0 &&
    inspection.foreignKeys.size === 0
  );
}

function findMissing(inspection: SchemaInspection, requirements: SchemaRequirements) {
  return {
    tables: requirements.tables.filter((tableName) => !inspection.tables.has(tableName)),
    columns: requirements.columns.filter((columnKey) => !inspection.columns.has(columnKey)),
    enumValues: (requirements.enumValues ?? []).filter(
      (enumValue) => !inspection.enumValues.has(enumValue)
    ),
    indexes: (requirements.indexes ?? [])
      .filter((requirement) => !hasIndexRequirement(inspection, requirement))
      .map(formatIndexRequirement),
    primaryKeys: (requirements.primaryKeys ?? [])
      .filter(
        (requirement) =>
          !hasKeyRequirement(inspection, inspection.primaryKeys, requirement, "PRIMARY KEY")
      )
      .map(formatKeyRequirement),
    uniqueConstraints: (requirements.uniqueConstraints ?? [])
      .filter(
        (requirement) =>
          !hasKeyRequirement(inspection, inspection.uniqueConstraints, requirement, "UNIQUE")
      )
      .map(formatKeyRequirement),
    foreignKeys: (requirements.foreignKeys ?? []).filter(
      (requirement) => !hasForeignKeyRequirement(inspection, requirement)
    )
      .map(formatForeignKeyRequirement)
  };
}

function formatIndexRequirement(requirement: RequiredIndex) {
  return `${requirement.name} on ${requirement.table}(${requirement.columns.join(
    ", "
  )}) unique=${requirement.unique} primary=${requirement.primary} method=${requirement.method}`;
}

function formatKeyRequirement(requirement: RequiredKeyConstraint) {
  return `${requirement.name} on ${requirement.table}(${requirement.columns.join(", ")})`;
}

function formatForeignKeyRequirement(requirement: RequiredForeignKey) {
  return `${requirement.name} on ${requirement.table}(${requirement.columns.join(
    ", "
  )}) -> ${requirement.referencedTable}(${requirement.referencedColumns.join(", ")})`;
}

function formatList(label: string, values: readonly string[]) {
  if (values.length === 0) {
    return "";
  }
  return `${label}: ${values.join(", ")}`;
}

function formatPartialDiagnosis(inspection: SchemaInspection) {
  for (const stage of baselineStages) {
    if (!hasAnyRequirement(inspection, stage.introduced)) {
      continue;
    }

    const missing = findMissing(inspection, stage.requirements);
    const lines = [
      "Unsafe legacy database schema without Prisma migration history.",
      `The schema partially matches ${stage.mode}, but required objects are missing.`,
      "No migrations will be resolved as applied.",
      formatList("Missing tables", missing.tables),
      formatList("Missing columns", missing.columns),
      formatList("Missing enum values", missing.enumValues),
      formatList("Missing or invalid indexes", missing.indexes),
      formatList("Missing or invalid primary keys", missing.primaryKeys),
      formatList("Missing or invalid unique constraints", missing.uniqueConstraints),
      formatList("Missing or invalid foreign keys", missing.foreignKeys)
    ].filter(Boolean);
    return `${lines.join("\n")}\n`;
  }

  return [
    "Unsafe legacy database schema without Prisma migration history.",
    "The schema does not match any known complete baseline.",
    "No migrations will be resolved as applied."
  ].join("\n") + "\n";
}

function classifyInspection(hasAppliedMigrations: boolean, inspection: SchemaInspection): BootstrapMode {
  if (hasAppliedMigrations) {
    return "ready";
  }

  if (isEmptyInspection(inspection)) {
    return "fresh";
  }

  // Baseline resolution is intentionally fail-closed: marking a migration as
  // applied is only safe when every object created by that migration and all
  // earlier migrations is already present. A single missing object means
  // Prisma would never create it later, so startup must stop instead.
  for (const stage of baselineStages) {
    if (hasEveryRequirement(inspection, stage.requirements)) {
      return stage.mode;
    }

    if (hasAnyRequirement(inspection, stage.introduced)) {
      return "partial";
    }
  }

  return "partial";
}

export function classifyMigrationBootstrapMode(args: {
  hasAppliedMigrations: boolean;
  schemaName?: string;
  presentTables: Iterable<string>;
  presentColumns?: Iterable<string>;
  presentEnumValues?: Iterable<string>;
  presentEnums?: Iterable<string>;
  presentIndexes?: Iterable<InspectedIndex>;
  presentPrimaryKeys?: Iterable<InspectedKeyConstraint>;
  presentUniqueConstraints?: Iterable<InspectedKeyConstraint>;
  presentForeignKeys?: Iterable<InspectedForeignKey>;
}): BootstrapMode {
  const enumValues = args.presentEnumValues ?? args.presentEnums ?? [];
  return classifyInspection(
    args.hasAppliedMigrations,
    toInspection({
      schemaName: args.schemaName,
      tables: args.presentTables,
      columns: args.presentColumns,
      enumValues,
      indexes: args.presentIndexes,
      primaryKeys: args.presentPrimaryKeys,
      uniqueConstraints: args.presentUniqueConstraints,
      foreignKeys: args.presentForeignKeys
    })
  );
}

async function detectMigrationBootstrapMode(): Promise<BootstrapMode> {
  const schemaRows = await prisma.$queryRaw<Array<{ schemaName: string }>>`
    SELECT current_schema() AS "schemaName"
  `;
  const schemaName = schemaRows[0]?.schemaName ?? defaultInspectionSchemaName;

  const migrationTableRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = '_prisma_migrations'
    ) AS "exists"
  `;

  const migrationTableExists = migrationTableRows[0]?.exists === true;
  let appliedMigrationCount = 0;

  if (migrationTableExists) {
    const countRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count"
      FROM "_prisma_migrations"
    `;
    appliedMigrationCount = countRows[0]?.count ?? 0;
  }

  const tableRows = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
  `;
  const columnRows = await prisma.$queryRaw<ColumnRow[]>`
    SELECT table_name || '.' || column_name AS "columnKey"
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name <> '_prisma_migrations'
  `;
  const enumRows = await prisma.$queryRaw<EnumValueRow[]>`
    SELECT pg_type.typname || '.' || pg_enum.enumlabel AS "enumValue"
    FROM pg_type
    JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
    JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_namespace.nspname = current_schema()
      AND pg_type.typtype = 'e'
  `;
  const indexRows = await prisma.$queryRaw<IndexRow[]>`
    SELECT
      index_namespace.nspname AS "schemaName",
      index_class.relname AS "indexName",
      table_class.relname AS "tableName",
      COALESCE(
        array_agg(table_attribute.attname ORDER BY index_key.ordinality)
          FILTER (WHERE table_attribute.attname IS NOT NULL),
        ARRAY[]::text[]
      ) AS "columnNames",
      pg_index.indisunique AS "isUnique",
      pg_index.indisprimary AS "isPrimary",
      pg_am.amname AS "methodName",
      pg_index.indexprs IS NOT NULL AS "hasExpressions",
      pg_index.indpred IS NOT NULL AS "isPartial"
    FROM pg_index
    JOIN pg_class index_class ON index_class.oid = pg_index.indexrelid
    JOIN pg_class table_class ON table_class.oid = pg_index.indrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    JOIN pg_am ON pg_am.oid = index_class.relam
    LEFT JOIN LATERAL unnest(pg_index.indkey) WITH ORDINALITY AS index_key(attnum, ordinality)
      ON index_key.ordinality <= pg_index.indnkeyatts
    LEFT JOIN pg_attribute table_attribute
      ON table_attribute.attrelid = table_class.oid
      AND table_attribute.attnum = index_key.attnum
    WHERE table_namespace.nspname = current_schema()
      AND index_namespace.nspname = current_schema()
      AND table_class.relname <> '_prisma_migrations'
      AND pg_index.indisvalid = true
      AND pg_index.indisready = true
    GROUP BY
      index_namespace.nspname,
      index_class.relname,
      table_class.relname,
      pg_index.indisunique,
      pg_index.indisprimary,
      pg_am.amname,
      pg_index.indexprs,
      pg_index.indpred
  `;
  const constraintRows = await prisma.$queryRaw<ConstraintRow[]>`
    SELECT
      pg_constraint.conname AS "constraintName",
      CASE pg_constraint.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'f' THEN 'FOREIGN KEY'
      END AS "constraintType",
      table_namespace.nspname AS "schemaName",
      table_class.relname AS "tableName",
      COALESCE(
        array_agg(table_attribute.attname ORDER BY source_key.ordinality)
          FILTER (WHERE table_attribute.attname IS NOT NULL),
        ARRAY[]::text[]
      ) AS "columnNames",
      referenced_namespace.nspname AS "referencedSchemaName",
      referenced_class.relname AS "referencedTableName",
      COALESCE(
        array_agg(referenced_attribute.attname ORDER BY source_key.ordinality)
          FILTER (WHERE referenced_attribute.attname IS NOT NULL),
        ARRAY[]::text[]
      ) AS "referencedColumnNames",
      CASE
        WHEN pg_constraint.contype = 'f' THEN
          CASE pg_constraint.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END
      END AS "onDelete",
      CASE
        WHEN pg_constraint.contype = 'f' THEN
          CASE pg_constraint.confupdtype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END
      END AS "onUpdate"
    FROM pg_constraint
    JOIN pg_class table_class ON table_class.oid = pg_constraint.conrelid
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    LEFT JOIN pg_class referenced_class ON referenced_class.oid = pg_constraint.confrelid
    LEFT JOIN pg_namespace referenced_namespace
      ON referenced_namespace.oid = referenced_class.relnamespace
    LEFT JOIN LATERAL unnest(pg_constraint.conkey) WITH ORDINALITY AS source_key(attnum, ordinality)
      ON true
    LEFT JOIN pg_attribute table_attribute
      ON table_attribute.attrelid = table_class.oid
      AND table_attribute.attnum = source_key.attnum
    LEFT JOIN LATERAL unnest(pg_constraint.confkey) WITH ORDINALITY AS referenced_key(attnum, ordinality)
      ON referenced_key.ordinality = source_key.ordinality
    LEFT JOIN pg_attribute referenced_attribute
      ON referenced_attribute.attrelid = referenced_class.oid
      AND referenced_attribute.attnum = referenced_key.attnum
    WHERE table_namespace.nspname = current_schema()
      AND table_class.relname <> '_prisma_migrations'
      AND pg_constraint.contype IN ('p', 'u', 'f')
    GROUP BY
      pg_constraint.oid,
      pg_constraint.conname,
      pg_constraint.contype,
      table_namespace.nspname,
      table_class.relname,
      referenced_namespace.nspname,
      referenced_class.relname,
      pg_constraint.confdeltype,
      pg_constraint.confupdtype
  `;

  const inspection = toInspection({
    schemaName,
    tables: tableRows.map((row) => row.tableName),
    columns: columnRows.map((row) => row.columnKey),
    enumValues: enumRows.map((row) => row.enumValue),
    indexes: indexRows.map((row) => ({
      schemaName: row.schemaName,
      name: row.indexName,
      table: row.tableName,
      columns: row.columnNames,
      unique: row.isUnique,
      primary: row.isPrimary,
      method: row.methodName,
      hasExpressions: row.hasExpressions,
      isPartial: row.isPartial
    })),
    primaryKeys: constraintRows
      .filter(
        (row): row is ConstraintRow & { constraintType: "PRIMARY KEY" } =>
          row.constraintType === "PRIMARY KEY"
      )
      .map((row) => ({
        schemaName: row.schemaName,
        name: row.constraintName,
        type: row.constraintType,
        table: row.tableName,
        columns: row.columnNames
      })),
    uniqueConstraints: constraintRows
      .filter(
        (row): row is ConstraintRow & { constraintType: "UNIQUE" } =>
          row.constraintType === "UNIQUE"
      )
      .map((row) => ({
        schemaName: row.schemaName,
        name: row.constraintName,
        type: row.constraintType,
        table: row.tableName,
        columns: row.columnNames
      })),
    foreignKeys: constraintRows
      .filter(
        (row): row is ConstraintRow & {
          constraintType: "FOREIGN KEY";
          referencedSchemaName: string;
          referencedTableName: string;
          onDelete: ReferentialAction;
          onUpdate: ReferentialAction;
        } =>
          row.constraintType === "FOREIGN KEY" &&
          row.referencedSchemaName !== null &&
          row.referencedTableName !== null &&
          row.onDelete !== null &&
          row.onUpdate !== null
      )
      .map((row) => ({
        schemaName: row.schemaName,
        name: row.constraintName,
        table: row.tableName,
        columns: row.columnNames,
        referencedSchemaName: row.referencedSchemaName,
        referencedTable: row.referencedTableName,
        referencedColumns: row.referencedColumnNames,
        onDelete: row.onDelete,
        onUpdate: row.onUpdate
      }))
  });
  const mode = classifyInspection(appliedMigrationCount > 0, inspection);

  if (mode === "partial") {
    process.stderr.write(formatPartialDiagnosis(inspection));
  }

  return mode;
}

async function run() {
  loadProjectEnvFile();
  loadConfig();
  const mode = await detectMigrationBootstrapMode();
  process.stdout.write(mode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
}
