-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REPORT_NOT_SUBMITTED', 'REPORT_RETURNED', 'REPORT_AWAITING_APPROVAL', 'ACTION_DUE_SOON', 'ACTION_OVERDUE', 'MATERIAL_SHORTAGE', 'REQUISITION_SUBMITTED', 'SAFETY_INCIDENT', 'PROGRESS_BEHIND_PLAN', 'FUND_UTILISATION_THRESHOLD');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "projectId" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
