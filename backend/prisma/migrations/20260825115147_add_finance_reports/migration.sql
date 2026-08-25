-- CreateEnum
CREATE TYPE "FinanceLineType" AS ENUM ('FUNDS_RECEIVED', 'EXPENDITURE', 'COMMITMENT');

-- CreateEnum
CREATE TYPE "FinanceCategory" AS ENUM ('ADVANCE_PAYMENT', 'OTHER_FUNDS', 'MATERIALS', 'LABOUR', 'PLANT_EQUIPMENT', 'TRANSPORT_LOGISTICS', 'SUBCONTRACTOR', 'SUPPLIER', 'PETTY_CASH', 'OTHER');

-- CreateTable
CREATE TABLE "finance_report_details" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "comments" TEXT,

    CONSTRAINT "finance_report_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transaction_lines" (
    "id" TEXT NOT NULL,
    "financeReportDetailId" TEXT NOT NULL,
    "type" "FinanceLineType" NOT NULL,
    "category" "FinanceCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "paymentReference" TEXT,

    CONSTRAINT "finance_transaction_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_report_details_reportId_key" ON "finance_report_details"("reportId");

-- AddForeignKey
ALTER TABLE "finance_report_details" ADD CONSTRAINT "finance_report_details_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transaction_lines" ADD CONSTRAINT "finance_transaction_lines_financeReportDetailId_fkey" FOREIGN KEY ("financeReportDetailId") REFERENCES "finance_report_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
