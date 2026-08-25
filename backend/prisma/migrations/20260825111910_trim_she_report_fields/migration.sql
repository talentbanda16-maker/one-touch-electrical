/*
  Warnings:

  - You are about to drop the column `closedActions` on the `she_report_details` table. All the data in the column will be lost.
  - You are about to drop the column `environmentalIssues` on the `she_report_details` table. All the data in the column will be lost.
  - You are about to drop the column `hazardsIdentified` on the `she_report_details` table. All the data in the column will be lost.
  - You are about to drop the column `outstandingActions` on the `she_report_details` table. All the data in the column will be lost.
  - You are about to drop the column `safetyObservations` on the `she_report_details` table. All the data in the column will be lost.
  - You are about to drop the column `workersOnSite` on the `she_report_details` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "she_report_details" DROP COLUMN "closedActions",
DROP COLUMN "environmentalIssues",
DROP COLUMN "hazardsIdentified",
DROP COLUMN "outstandingActions",
DROP COLUMN "safetyObservations",
DROP COLUMN "workersOnSite";
