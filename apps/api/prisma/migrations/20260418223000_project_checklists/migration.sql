-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED');

-- CreateTable
CREATE TABLE "ProjectChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChecklistSection" (
    "id" TEXT NOT NULL,
    "projectChecklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChecklistSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectChecklistItem" (
    "id" TEXT NOT NULL,
    "projectChecklistSectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ChecklistItemStatus" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChecklist_projectId_key" ON "ProjectChecklist"("projectId");

-- CreateIndex
CREATE INDEX "ProjectChecklistSection_projectChecklistId_sortOrder_idx" ON "ProjectChecklistSection"("projectChecklistId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_projectChecklistSectionId_sortOrder_idx" ON "ProjectChecklistItem"("projectChecklistSectionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistSection" ADD CONSTRAINT "ProjectChecklistSection_projectChecklistId_fkey" FOREIGN KEY ("projectChecklistId") REFERENCES "ProjectChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_projectChecklistSectionId_fkey" FOREIGN KEY ("projectChecklistSectionId") REFERENCES "ProjectChecklistSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
