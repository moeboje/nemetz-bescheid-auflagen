ALTER TABLE "Obligation" ADD COLUMN "recurrenceEndDate" TEXT;
ALTER TABLE "Obligation" ADD COLUMN "externalOrgId" TEXT;
ALTER TABLE "Obligation" ADD COLUMN "externalUserId" TEXT;

ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_externalOrgId_fkey"
  FOREIGN KEY ("externalOrgId") REFERENCES "ExternalOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_externalUserId_fkey"
  FOREIGN KEY ("externalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Obligation_externalOrgId_idx" ON "Obligation"("externalOrgId");
CREATE INDEX "Obligation_externalUserId_idx" ON "Obligation"("externalUserId");
