-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('RECEIVED', 'ISSUED', 'RETURNED', 'DAMAGED_LOST');

-- CreateTable
CREATE TABLE "stores_report_details" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "shortagesAndRequirements" TEXT,
    "comments" TEXT,

    CONSTRAINT "stores_report_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transaction_lines" (
    "id" TEXT NOT NULL,
    "storesReportDetailId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "direction" "StockDirection" NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unit" TEXT,
    "unitCost" DECIMAL(14,2),
    "supplier" TEXT,
    "deliveryReference" TEXT,
    "notes" TEXT,

    CONSTRAINT "stock_transaction_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_report_details_reportId_key" ON "stores_report_details"("reportId");

-- AddForeignKey
ALTER TABLE "stores_report_details" ADD CONSTRAINT "stores_report_details_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transaction_lines" ADD CONSTRAINT "stock_transaction_lines_storesReportDetailId_fkey" FOREIGN KEY ("storesReportDetailId") REFERENCES "stores_report_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
