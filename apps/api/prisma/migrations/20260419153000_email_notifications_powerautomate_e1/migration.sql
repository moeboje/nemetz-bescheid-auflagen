-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_idempotencyKey_key" ON "NotificationOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_scheduledFor_idx" ON "NotificationOutbox"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationOutbox_claimedAt_idx" ON "NotificationOutbox"("claimedAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_recipientUserId_createdAt_idx" ON "NotificationOutbox"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_entityType_entityId_idx" ON "NotificationOutbox"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
