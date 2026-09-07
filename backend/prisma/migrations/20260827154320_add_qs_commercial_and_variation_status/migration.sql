-- CreateEnum
CREATE TYPE "VariationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "qs_report_details" ADD COLUMN     "commercialIssues" TEXT;

-- AlterTable
ALTER TABLE "qs_report_lines" ADD COLUMN     "variationStatus" "VariationStatus";
