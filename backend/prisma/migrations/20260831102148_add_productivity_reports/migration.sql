-- CreateEnum
CREATE TYPE "ProductivityReportStatus" AS ENUM ('SUBMITTED', 'SUPERVISOR_REVIEWED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GENERAL_WORKER';

-- CreateTable
CREATE TABLE "productivity_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "status" "ProductivityReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "employeeIdNumber" TEXT,
    "department" TEXT,
    "position" TEXT,
    "siteLocation" TEXT,
    "supervisorName" TEXT,
    "shift" TEXT,
    "workTargets" JSONB NOT NULL,
    "totalTarget" DECIMAL(10,2),
    "totalCompleted" DECIMAL(10,2),
    "overallAchievementPercent" INTEGER,
    "workCompletedToday" TEXT,
    "workNotCompleted" JSONB,
    "delayExperienced" BOOLEAN NOT NULL DEFAULT false,
    "totalDelayHours" DECIMAL(6,2),
    "delays" JSONB,
    "delayCategories" TEXT[],
    "materialsRequired" JSONB,
    "qualityStandardMet" TEXT,
    "reworkDetails" TEXT,
    "normalHours" DECIMAL(5,2),
    "actualHoursWorked" DECIMAL(5,2),
    "productiveHours" DECIMAL(5,2),
    "delayHours" DECIMAL(5,2),
    "overtimeRequested" BOOLEAN NOT NULL DEFAULT false,
    "overtimeHoursRequested" DECIMAL(5,2),
    "overtimeReason" TEXT,
    "expectedOvertimeOutput" TEXT,
    "tomorrowPlan" JSONB,
    "employeeSignatureName" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "targetAchievementPercent" INTEGER,
    "productivityRating" TEXT,
    "delayJustified" TEXT,
    "overtimeRecommendation" TEXT,
    "supervisorComments" TEXT,
    "supervisorSignatureName" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "productivityScore" INTEGER,
    "overtimeHoursApproved" DECIMAL(5,2),
    "overtimeCost" DECIMAL(10,2),
    "managementActions" TEXT[],

    CONSTRAINT "productivity_reports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "productivity_reports" ADD CONSTRAINT "productivity_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_reports" ADD CONSTRAINT "productivity_reports_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_reports" ADD CONSTRAINT "productivity_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productivity_reports" ADD CONSTRAINT "productivity_reports_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
