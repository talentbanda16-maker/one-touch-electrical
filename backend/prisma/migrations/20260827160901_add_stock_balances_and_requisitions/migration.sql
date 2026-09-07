-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "stock_transaction_lines" ADD COLUMN     "closingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "material_requisitions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantityRequested" DECIMAL(14,2) NOT NULL,
    "unit" TEXT,
    "urgency" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RequisitionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledById" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfillmentNotes" TEXT,

    CONSTRAINT "material_requisitions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "material_requisitions" ADD CONSTRAINT "material_requisitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requisitions" ADD CONSTRAINT "material_requisitions_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requisitions" ADD CONSTRAINT "material_requisitions_fulfilledById_fkey" FOREIGN KEY ("fulfilledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
