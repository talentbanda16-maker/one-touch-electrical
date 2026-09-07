-- AlterTable
ALTER TABLE "she_report_details" ADD COLUMN     "environmentalIssues" TEXT,
ADD COLUMN     "hazardsIdentified" TEXT,
ADD COLUMN     "safetyObservations" TEXT,
ADD COLUMN     "workersOnSite" INTEGER NOT NULL DEFAULT 0;
