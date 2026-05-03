CREATE TYPE "BrandingAssetType" AS ENUM ('SIDEBAR_LOGO', 'SIDEBAR_ICON');

CREATE TABLE "BrandingAsset" (
    "id" TEXT NOT NULL,
    "type" "BrandingAssetType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandingAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandingAsset_type_key"
ON "BrandingAsset"("type");

CREATE INDEX "BrandingAsset_updatedById_idx"
ON "BrandingAsset"("updatedById");

CREATE INDEX "BrandingAsset_updatedAt_idx"
ON "BrandingAsset"("updatedAt");

ALTER TABLE "BrandingAsset"
ADD CONSTRAINT "BrandingAsset_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
