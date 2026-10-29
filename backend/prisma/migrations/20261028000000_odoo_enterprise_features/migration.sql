-- Enterprise features: reference numbers, archive flag, requisition approval,
-- created_by on BomItem.

-- 1. Extend RequisitionStatus enum
ALTER TYPE "RequisitionStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "RequisitionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- 2. MaterialRequisition: refNumber, approval fields, archive flag
ALTER TABLE "material_requisitions"
  ADD COLUMN IF NOT EXISTS "refNumber"      TEXT,
  ADD COLUMN IF NOT EXISTS "approvedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "isArchived"     BOOLEAN NOT NULL DEFAULT false;

-- 3. Action: refNumber, archive flag
ALTER TABLE "actions"
  ADD COLUMN IF NOT EXISTS "refNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- 4. Instruction: archive flag
ALTER TABLE "instructions"
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- 5. Project: archive flag
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- 6. BomItem: createdById, archive flag
ALTER TABLE "bom_items"
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "isArchived"  BOOLEAN NOT NULL DEFAULT false;

-- 7. Unique partial indexes (NULLs are excluded so existing rows don't conflict)
CREATE UNIQUE INDEX IF NOT EXISTS "material_requisitions_refNumber_key"
  ON "material_requisitions"("refNumber") WHERE "refNumber" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "actions_refNumber_key"
  ON "actions"("refNumber") WHERE "refNumber" IS NOT NULL;

-- 8. Foreign keys
ALTER TABLE "material_requisitions"
  DROP CONSTRAINT IF EXISTS "material_requisitions_approvedById_fkey";
ALTER TABLE "material_requisitions"
  ADD CONSTRAINT "material_requisitions_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bom_items"
  DROP CONSTRAINT IF EXISTS "bom_items_createdById_fkey";
ALTER TABLE "bom_items"
  ADD CONSTRAINT "bom_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
