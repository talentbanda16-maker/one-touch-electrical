-- CreateEnum
CREATE TYPE "ShePeriodType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "she_report_details"
  ADD COLUMN "periodType" "ShePeriodType" NOT NULL DEFAULT 'DAILY',
  ADD COLUMN "periodEnd" DATE;
