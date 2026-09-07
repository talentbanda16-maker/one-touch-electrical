-- AlterTable
ALTER TABLE "foreman_report_details"
  ADD COLUMN "electricalSupervisors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "electricians" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "electricalAssistants" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "generalHands" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sheOfficersOnSite" INTEGER NOT NULL DEFAULT 0,
  DROP COLUMN "labourSkilled",
  DROP COLUMN "labourUnskilled",
  DROP COLUMN "labourSubcontractor";
