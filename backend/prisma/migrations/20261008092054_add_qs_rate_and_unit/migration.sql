-- AlterTable
ALTER TABLE "qs_report_lines" ADD COLUMN     "contractAmount" DECIMAL(14,2),
ADD COLUMN     "contractRate" DECIMAL(14,2),
ADD COLUMN     "cumulativeAmount" DECIMAL(14,2),
ADD COLUMN     "periodAmount" DECIMAL(14,2),
ADD COLUMN     "unit" TEXT;
