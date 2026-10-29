-- CreateTable
CREATE TABLE "project_boq_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "boqItemNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "contractQuantity" DECIMAL(14,4) NOT NULL,
    "contractRate" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_boq_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "project_boq_items" ADD CONSTRAINT "project_boq_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
