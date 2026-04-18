ALTER TABLE "AuthorityContact"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "mobile" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "reference" TEXT,
    "issuedAt" TEXT,
    "authorityId" TEXT,
    "authorityContactId" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "aiExtraction" JSONB,
    "scopeOverride" JSONB,
    "archivedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "legalDocId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "infoTextLong" TEXT,
    "level" TEXT NOT NULL,
    "criticality" TEXT,
    "scheduleType" TEXT NOT NULL,
    "firstDueDate" TEXT,
    "intervalUnit" TEXT,
    "intervalValue" INTEGER,
    "ownerUserId" TEXT,
    "deputyUserId" TEXT,
    "origin" TEXT,
    "sourceSuggestionId" TEXT,
    "sourceRunId" TEXT,
    "emailReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailReminderDaysBefore" INTEGER,
    "evidenceRequirements" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "archivedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "projectId" TEXT,
    "legalDocId" TEXT,
    "authorityId" TEXT,
    "ownerUserId" TEXT,
    "deputyUserId" TEXT,
    "emailReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailReminderDaysBefore" INTEGER,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "archivedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalSnapshot" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegalDocument_projectId_idx" ON "LegalDocument"("projectId");
CREATE INDEX "LegalDocument_authorityId_idx" ON "LegalDocument"("authorityId");
CREATE INDEX "LegalDocument_authorityContactId_idx" ON "LegalDocument"("authorityContactId");
CREATE INDEX "LegalDocument_isArchived_idx" ON "LegalDocument"("isArchived");

CREATE INDEX "Obligation_legalDocId_idx" ON "Obligation"("legalDocId");
CREATE INDEX "Obligation_ownerUserId_idx" ON "Obligation"("ownerUserId");
CREATE INDEX "Obligation_deputyUserId_idx" ON "Obligation"("deputyUserId");
CREATE INDEX "Obligation_isArchived_idx" ON "Obligation"("isArchived");

CREATE INDEX "Deadline_projectId_idx" ON "Deadline"("projectId");
CREATE INDEX "Deadline_legalDocId_idx" ON "Deadline"("legalDocId");
CREATE INDEX "Deadline_authorityId_idx" ON "Deadline"("authorityId");
CREATE INDEX "Deadline_ownerUserId_idx" ON "Deadline"("ownerUserId");
CREATE INDEX "Deadline_deputyUserId_idx" ON "Deadline"("deputyUserId");
CREATE INDEX "Deadline_completedByUserId_idx" ON "Deadline"("completedByUserId");
CREATE INDEX "Deadline_status_idx" ON "Deadline"("status");
CREATE INDEX "Deadline_dueDate_idx" ON "Deadline"("dueDate");
CREATE INDEX "Deadline_isArchived_idx" ON "Deadline"("isArchived");

CREATE UNIQUE INDEX "PortalSnapshot_scopeKey_key" ON "PortalSnapshot"("scopeKey");

ALTER TABLE "LegalDocument"
ADD CONSTRAINT "LegalDocument_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegalDocument"
ADD CONSTRAINT "LegalDocument_authorityId_fkey"
FOREIGN KEY ("authorityId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LegalDocument"
ADD CONSTRAINT "LegalDocument_authorityContactId_fkey"
FOREIGN KEY ("authorityContactId") REFERENCES "AuthorityContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Obligation"
ADD CONSTRAINT "Obligation_legalDocId_fkey"
FOREIGN KEY ("legalDocId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Obligation"
ADD CONSTRAINT "Obligation_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Obligation"
ADD CONSTRAINT "Obligation_deputyUserId_fkey"
FOREIGN KEY ("deputyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deadline"
ADD CONSTRAINT "Deadline_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deadline"
ADD CONSTRAINT "Deadline_legalDocId_fkey"
FOREIGN KEY ("legalDocId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deadline"
ADD CONSTRAINT "Deadline_authorityId_fkey"
FOREIGN KEY ("authorityId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deadline"
ADD CONSTRAINT "Deadline_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deadline"
ADD CONSTRAINT "Deadline_deputyUserId_fkey"
FOREIGN KEY ("deputyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deadline"
ADD CONSTRAINT "Deadline_completedByUserId_fkey"
FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
