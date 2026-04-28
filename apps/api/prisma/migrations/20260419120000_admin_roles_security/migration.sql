ALTER TABLE "Role"
ADD COLUMN "permissionsJson" JSONB;

CREATE TABLE "SecuritySettings" (
    "id" TEXT NOT NULL,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 12,
    "passwordRequireNumberOrSpecial" BOOLEAN NOT NULL DEFAULT true,
    "maxFailedLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "sessionTtlDays" INTEGER NOT NULL DEFAULT 7,
    "allowExternalUsers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecuritySettings_pkey" PRIMARY KEY ("id")
);
