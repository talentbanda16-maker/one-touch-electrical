-- AlterTable: make percentage nullable so target-only entries are allowed
ALTER TABLE "progress_logs" ALTER COLUMN "percentage" DROP NOT NULL;
