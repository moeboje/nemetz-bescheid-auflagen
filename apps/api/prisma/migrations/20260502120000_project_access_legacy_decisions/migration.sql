-- CreateEnum
CREATE TYPE "ProjectAccessRole" AS ENUM ('PROJECT_VIEWER', 'PROJECT_EDITOR', 'EXTERNAL_PROJECT_VIEWER', 'EXTERNAL_EXECUTOR');

-- CreateEnum
CREATE TYPE "LegacyDecisionStatus" AS ENUM ('ARCHIVE_ONLY', 'HISTORICALLY_RELEVANT', 'PARTIALLY_RELEVANT', 'NEEDS_REVIEW', 'SUPERSEDED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "LegacyDecisionReviewStatus" AS ENUM ('NOT_REVIEWED', 'IN_REVIEW', 'REVIEWED');

-- CreateTable
CREATE TABLE "ProjectAccess" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessRole" "ProjectAccessRole" NOT NULL,
  "note" TEXT,
  "grantedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyDecision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fileNumber" TEXT,
  "authorityId" TEXT,
  "authorityName" TEXT,
  "issuedAt" TEXT,
  "validFrom" TEXT,
  "validUntil" TEXT,
  "legacyStatus" "LegacyDecisionStatus" NOT NULL DEFAULT 'ARCHIVE_ONLY',
  "reviewStatus" "LegacyDecisionReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
  "relevanceNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "linkedLegalDocId" TEXT,
  "supersededByLegalDocId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LegacyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAccess_projectId_userId_key" ON "ProjectAccess"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectAccess_projectId_idx" ON "ProjectAccess"("projectId");

-- CreateIndex
CREATE INDEX "ProjectAccess_userId_idx" ON "ProjectAccess"("userId");

-- CreateIndex
CREATE INDEX "ProjectAccess_accessRole_idx" ON "ProjectAccess"("accessRole");

-- CreateIndex
CREATE INDEX "LegacyDecision_projectId_idx" ON "LegacyDecision"("projectId");

-- CreateIndex
CREATE INDEX "LegacyDecision_authorityId_idx" ON "LegacyDecision"("authorityId");

-- CreateIndex
CREATE INDEX "LegacyDecision_reviewedByUserId_idx" ON "LegacyDecision"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "LegacyDecision_linkedLegalDocId_idx" ON "LegacyDecision"("linkedLegalDocId");

-- CreateIndex
CREATE INDEX "LegacyDecision_supersededByLegalDocId_idx" ON "LegacyDecision"("supersededByLegalDocId");

-- CreateIndex
CREATE INDEX "LegacyDecision_legacyStatus_idx" ON "LegacyDecision"("legacyStatus");

-- CreateIndex
CREATE INDEX "LegacyDecision_reviewStatus_idx" ON "LegacyDecision"("reviewStatus");

-- CreateIndex
CREATE INDEX "LegacyDecision_isArchived_idx" ON "LegacyDecision"("isArchived");

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyDecision" ADD CONSTRAINT "LegacyDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyDecision" ADD CONSTRAINT "LegacyDecision_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyDecision" ADD CONSTRAINT "LegacyDecision_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyDecision" ADD CONSTRAINT "LegacyDecision_linkedLegalDocId_fkey" FOREIGN KEY ("linkedLegalDocId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyDecision" ADD CONSTRAINT "LegacyDecision_supersededByLegalDocId_fkey" FOREIGN KEY ("supersededByLegalDocId") REFERENCES "LegalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
