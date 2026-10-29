-- Add direct-entry financial fields to projects so QS can enter claimed and paid amounts without going through full report flow
ALTER TABLE "projects" ADD COLUMN "claimedAmount" DECIMAL(14,2);
ALTER TABLE "projects" ADD COLUMN "paidAmount" DECIMAL(14,2);
