-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "labelDe" TEXT NOT NULL,
    "descriptionDe" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExternalOrganization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titleOrPosition" TEXT,
    "department" TEXT,
    "externalCompany" TEXT,
    "externalOrgId" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT NOT NULL,
    "passwordUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPasswordResetAt" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "invitedAt" DATETIME,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnforced" BOOLEAN NOT NULL DEFAULT false,
    "mfaTotpSecretEnc" TEXT,
    "mfaVerifiedAt" DATETIME,
    "mfaRecoveryCodesHashJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_externalOrgId_fkey" FOREIGN KEY ("externalOrgId") REFERENCES "ExternalOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "department", "email", "externalCompany", "failedLoginCount", "firstName", "id", "invitedAt", "isArchived", "lastLoginAt", "lastName", "lastPasswordResetAt", "lockedUntil", "mfaEnabled", "mfaEnforced", "mfaRecoveryCodesHashJson", "mfaTotpSecretEnc", "mfaVerifiedAt", "mustChangePassword", "notes", "passwordHash", "passwordUpdatedAt", "phone", "role", "titleOrPosition", "type", "updatedAt") SELECT "createdAt", "department", "email", "externalCompany", "failedLoginCount", "firstName", "id", "invitedAt", "isArchived", "lastLoginAt", "lastName", "lastPasswordResetAt", "lockedUntil", "mfaEnabled", "mfaEnforced", "mfaRecoveryCodesHashJson", "mfaTotpSecretEnc", "mfaVerifiedAt", "mustChangePassword", "notes", "passwordHash", "passwordUpdatedAt", "phone", "role", "titleOrPosition", "type", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_isArchived_idx" ON "User"("isArchived");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_type_idx" ON "User"("type");
CREATE INDEX "User_externalOrgId_idx" ON "User"("externalOrgId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "Role_isArchived_idx" ON "Role"("isArchived");

-- CreateIndex
CREATE INDEX "Role_labelDe_idx" ON "Role"("labelDe");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOrganization_name_key" ON "ExternalOrganization"("name");

-- CreateIndex
CREATE INDEX "ExternalOrganization_isArchived_idx" ON "ExternalOrganization"("isArchived");

-- CreateIndex
CREATE INDEX "ExternalOrganization_type_idx" ON "ExternalOrganization"("type");

INSERT INTO "Role" ("id", "key", "labelDe", "descriptionDe", "isSystem", "isArchived", "createdAt", "updatedAt")
VALUES
    ('role_admin', 'ADMIN', 'Admin', NULL, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role_compliance', 'COMPLIANCE', 'Compliance', NULL, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role_user', 'USER', 'Benutzer', NULL, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('role_external', 'EXTERNAL', 'Extern', NULL, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT("key") DO NOTHING;
