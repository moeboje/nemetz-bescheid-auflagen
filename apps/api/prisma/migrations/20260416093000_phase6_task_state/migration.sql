CREATE TABLE "TaskStateEntry" (
    "taskInstanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completedByLabel" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStateEntry_pkey" PRIMARY KEY ("taskInstanceId")
);

CREATE INDEX "TaskStateEntry_completedByUserId_idx" ON "TaskStateEntry"("completedByUserId");
CREATE INDEX "TaskStateEntry_status_idx" ON "TaskStateEntry"("status");
CREATE INDEX "TaskStateEntry_updatedAt_idx" ON "TaskStateEntry"("updatedAt");

ALTER TABLE "TaskStateEntry"
ADD CONSTRAINT "TaskStateEntry_completedByUserId_fkey"
FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
