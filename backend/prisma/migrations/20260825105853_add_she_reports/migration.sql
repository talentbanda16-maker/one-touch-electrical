-- CreateTable
CREATE TABLE "she_report_details" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "workersOnSite" INTEGER NOT NULL DEFAULT 0,
    "toolboxTalksConducted" TEXT,
    "safetyInspections" TEXT,
    "ppeCompliance" TEXT,
    "hazardsIdentified" TEXT,
    "correctiveActions" TEXT,
    "incidentCount" INTEGER NOT NULL DEFAULT 0,
    "nearMissCount" INTEGER NOT NULL DEFAULT 0,
    "incidentsDescription" TEXT,
    "environmentalIssues" TEXT,
    "safetyObservations" TEXT,
    "outstandingActions" TEXT,
    "closedActions" TEXT,

    CONSTRAINT "she_report_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "she_report_details_reportId_key" ON "she_report_details"("reportId");

-- AddForeignKey
ALTER TABLE "she_report_details" ADD CONSTRAINT "she_report_details_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
