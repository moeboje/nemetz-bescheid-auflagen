CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "authorityRef" TEXT,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT,
    "facilityId" TEXT,
    "authorityId" TEXT,
    "authorityContactId" TEXT,
    "ownerUserId" TEXT,
    "deputyUserId" TEXT,
    "participantUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "internalParticipants" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "externalParticipants" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "dependsOnProjectIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "referenceLegalDocIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "archivedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_companyId_idx" ON "Project"("companyId");
CREATE INDEX "Project_siteId_idx" ON "Project"("siteId");
CREATE INDEX "Project_facilityId_idx" ON "Project"("facilityId");
CREATE INDEX "Project_authorityId_idx" ON "Project"("authorityId");
CREATE INDEX "Project_authorityContactId_idx" ON "Project"("authorityContactId");
CREATE INDEX "Project_ownerUserId_idx" ON "Project"("ownerUserId");
CREATE INDEX "Project_deputyUserId_idx" ON "Project"("deputyUserId");
CREATE INDEX "Project_isArchived_idx" ON "Project"("isArchived");

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_facilityId_fkey"
    FOREIGN KEY ("facilityId") REFERENCES "Facility"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_authorityId_fkey"
    FOREIGN KEY ("authorityId") REFERENCES "Authority"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_authorityContactId_fkey"
    FOREIGN KEY ("authorityContactId") REFERENCES "AuthorityContact"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_deputyUserId_fkey"
    FOREIGN KEY ("deputyUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
