-- CreateTable
CREATE TABLE "NotificationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "httpStatus" INTEGER,
    "errorSummary" TEXT,
    "providerReference" TEXT,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "defaultDueSoonDays" INTEGER NOT NULL DEFAULT 7,
    "deadlineDueSoonEnabled" BOOLEAN NOT NULL DEFAULT true,
    "assignmentAssignedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyDigestHourLocal" INTEGER NOT NULL DEFAULT 7,
    "weeklyDigestWeekday" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationWorkerStatus" (
    "workerKey" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastSuccessfulAt" TIMESTAMP(3),
    "lastOutcome" TEXT,
    "lastError" TEXT,
    "lastClaimedCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationWorkerStatus_pkey" PRIMARY KEY ("workerKey")
);

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_notificationId_createdAt_idx" ON "NotificationDeliveryAttempt"("notificationId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_outcome_createdAt_idx" ON "NotificationDeliveryAttempt"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_triggeredByUserId_idx" ON "NotificationDeliveryAttempt"("triggeredByUserId");

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "NotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
