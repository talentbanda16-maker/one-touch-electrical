-- CreateTable
CREATE TABLE "qs_report_details" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "comments" TEXT,

    CONSTRAINT "qs_report_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qs_report_lines" (
    "id" TEXT NOT NULL,
    "qsReportDetailId" TEXT NOT NULL,
    "boqItemNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contractQuantity" DECIMAL(14,2) NOT NULL,
    "quantityToday" DECIMAL(14,2) NOT NULL,
    "cumulativeQuantity" DECIMAL(14,2) NOT NULL,
    "balanceQuantity" DECIMAL(14,2) NOT NULL,
    "percentCompletion" INTEGER NOT NULL,
    "measurements" TEXT,
    "valuationAmount" DECIMAL(14,2),
    "variationReference" TEXT,
    "comments" TEXT,

    CONSTRAINT "qs_report_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qs_report_details_reportId_key" ON "qs_report_details"("reportId");

-- AddForeignKey
ALTER TABLE "qs_report_details" ADD CONSTRAINT "qs_report_details_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qs_report_lines" ADD CONSTRAINT "qs_report_lines_qsReportDetailId_fkey" FOREIGN KEY ("qsReportDetailId") REFERENCES "qs_report_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
