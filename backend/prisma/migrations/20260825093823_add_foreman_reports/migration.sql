-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('FOREMAN', 'QS', 'SHE', 'STORES', 'FINANCE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "reportDate" DATE NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foreman_report_details" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "siteLocation" TEXT,
    "workersOnSite" INTEGER NOT NULL DEFAULT 0,
    "labourSkilled" INTEGER NOT NULL DEFAULT 0,
    "labourUnskilled" INTEGER NOT NULL DEFAULT 0,
    "labourSubcontractor" INTEGER NOT NULL DEFAULT 0,
    "workCompleted" TEXT,
    "workInProgress" TEXT,
    "percentProgress" INTEGER NOT NULL DEFAULT 0,
    "equipmentUsed" TEXT,
    "materialsUsed" TEXT,
    "materialsRequired" TEXT,
    "constraints" TEXT,
    "instructionsReceived" TEXT,
    "nextDayPlan" TEXT,

    CONSTRAINT "foreman_report_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_submissionId_key" ON "reports"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "foreman_report_details_reportId_key" ON "foreman_report_details"("reportId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreman_report_details" ADD CONSTRAINT "foreman_report_details_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
