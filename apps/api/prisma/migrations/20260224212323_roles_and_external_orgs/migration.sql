CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelDe" TEXT NOT NULL,
    "descriptionDe" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOrganization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "externalOrgId" TEXT;

ALTER TABLE "User"
ADD CONSTRAINT "User_externalOrgId_fkey"
FOREIGN KEY ("externalOrgId") REFERENCES "ExternalOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE INDEX "Role_isArchived_idx" ON "Role"("isArchived");
CREATE INDEX "Role_labelDe_idx" ON "Role"("labelDe");
CREATE INDEX "ExternalOrganization_isArchived_idx" ON "ExternalOrganization"("isArchived");
CREATE INDEX "ExternalOrganization_name_idx" ON "ExternalOrganization"("name");
CREATE INDEX "User_externalOrgId_idx" ON "User"("externalOrgId");
