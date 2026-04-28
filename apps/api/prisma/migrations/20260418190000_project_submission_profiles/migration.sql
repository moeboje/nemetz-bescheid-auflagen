-- CreateEnum
CREATE TYPE "SubmissionProfileType" AS ENUM ('BASE', 'ADDON');

-- CreateTable
CREATE TABLE "SubmissionProfile" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "profileType" "SubmissionProfileType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionProfile_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ProjectSubmissionProfileAssignment" (
    "projectId" TEXT NOT NULL,
    "profileKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSubmissionProfileAssignment_pkey" PRIMARY KEY ("projectId","profileKey")
);

-- CreateIndex
CREATE INDEX "SubmissionProfile_isActive_idx" ON "SubmissionProfile"("isActive");

-- CreateIndex
CREATE INDEX "SubmissionProfile_profileType_sortOrder_idx" ON "SubmissionProfile"("profileType", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectSubmissionProfileAssignment_profileKey_idx" ON "ProjectSubmissionProfileAssignment"("profileKey");

-- AddForeignKey
ALTER TABLE "ProjectSubmissionProfileAssignment" ADD CONSTRAINT "ProjectSubmissionProfileAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSubmissionProfileAssignment" ADD CONSTRAINT "ProjectSubmissionProfileAssignment_profileKey_fkey" FOREIGN KEY ("profileKey") REFERENCES "SubmissionProfile"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
