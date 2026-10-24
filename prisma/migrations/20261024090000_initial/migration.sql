-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "instagram_parser";
SET search_path = "instagram_parser";

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_USER', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publicConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "intervalHours" INTEGER NOT NULL DEFAULT 24,
    "nextRunAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "extraction" TEXT NOT NULL,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "state" TEXT NOT NULL DEFAULT 'IDLE',
    "appVersion" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pairing" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "installationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "deviceId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "from" TIMESTAMPTZ(3) NOT NULL,
    "until" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'MANUAL',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "checkpoint" JSONB,
    "postsReceived" INTEGER NOT NULL DEFAULT 0,
    "skippedPosts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "message" TEXT,
    "oldestSeenAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_username_key" ON "Profile"("username");

-- CreateIndex
CREATE INDEX "Profile_active_nextRunAt_idx" ON "Profile"("active", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_shortcode_key" ON "Post"("shortcode");

-- CreateIndex
CREATE INDEX "Post_profileId_publishedAt_idx" ON "Post"("profileId", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_publishedAt_id_idx" ON "Post"("publishedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Device_installationId_key" ON "Device"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Pairing_codeHash_key" ON "Pairing"("codeHash");

-- CreateIndex
CREATE INDEX "Task_status_availableAt_createdAt_idx" ON "Task"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "Task_profileId_from_until_idx" ON "Task"("profileId", "from", "until");

-- CreateIndex
CREATE INDEX "Task_deviceId_status_idx" ON "Task"("deviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_taskId_batchId_key" ON "Receipt"("taskId", "batchId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-enforced exclusivity across scheduler and multiple web replicas.
CREATE UNIQUE INDEX "Task_one_active_profile" ON "Task" ("profileId")
WHERE status IN ('QUEUED', 'RUNNING', 'WAITING_USER');
CREATE UNIQUE INDEX "Task_one_active_device" ON "Task" ("deviceId")
WHERE "deviceId" IS NOT NULL AND status IN ('RUNNING', 'WAITING_USER');
ALTER TABLE "Task" ADD CONSTRAINT "Task_valid_range" CHECK ("from" < "until");

