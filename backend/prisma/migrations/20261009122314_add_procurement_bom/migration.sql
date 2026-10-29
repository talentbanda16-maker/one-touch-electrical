-- CreateTable
CREATE TABLE "bom_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "qtyNeeded" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "qtyOrdered" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "qtyDelivered" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "qtyUsed" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "budgetUnitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_usage_logs" (
    "id" TEXT NOT NULL,
    "bomItemId" TEXT NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bom_usage_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_usage_logs" ADD CONSTRAINT "bom_usage_logs_bomItemId_fkey" FOREIGN KEY ("bomItemId") REFERENCES "bom_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_usage_logs" ADD CONSTRAINT "bom_usage_logs_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
