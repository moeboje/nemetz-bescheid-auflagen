-- Add document categories and auditable approval workflow metadata.
ALTER TABLE "Document" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Document" ADD COLUMN "fileVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "DocumentApprovalRequest" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "fileVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestedComment" TEXT,
  "approverUserId" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentApprovalEvent" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "approvalRequestId" TEXT,
  "fileVersion" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "actorUserId" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_category_idx" ON "Document"("category");
CREATE INDEX "DocumentApprovalRequest_documentId_idx" ON "DocumentApprovalRequest"("documentId");
CREATE INDEX "DocumentApprovalRequest_documentId_fileVersion_createdAt_idx" ON "DocumentApprovalRequest"("documentId", "fileVersion", "createdAt");
CREATE INDEX "DocumentApprovalRequest_status_idx" ON "DocumentApprovalRequest"("status");
CREATE INDEX "DocumentApprovalRequest_requestedByUserId_idx" ON "DocumentApprovalRequest"("requestedByUserId");
CREATE INDEX "DocumentApprovalRequest_approverUserId_idx" ON "DocumentApprovalRequest"("approverUserId");
CREATE INDEX "DocumentApprovalRequest_decidedByUserId_idx" ON "DocumentApprovalRequest"("decidedByUserId");
CREATE INDEX "DocumentApprovalEvent_documentId_createdAt_idx" ON "DocumentApprovalEvent"("documentId", "createdAt");
CREATE INDEX "DocumentApprovalEvent_approvalRequestId_idx" ON "DocumentApprovalEvent"("approvalRequestId");
CREATE INDEX "DocumentApprovalEvent_actorUserId_idx" ON "DocumentApprovalEvent"("actorUserId");
CREATE INDEX "DocumentApprovalEvent_eventType_idx" ON "DocumentApprovalEvent"("eventType");

ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentApprovalEvent" ADD CONSTRAINT "DocumentApprovalEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentApprovalEvent" ADD CONSTRAINT "DocumentApprovalEvent_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "DocumentApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentApprovalEvent" ADD CONSTRAINT "DocumentApprovalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
