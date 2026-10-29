-- CreateTable
CREATE TABLE "qs_payments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportId" TEXT,
    "amountPaid" DECIMAL(14,2) NOT NULL,
    "datePaid" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qs_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "qs_payments" ADD CONSTRAINT "qs_payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qs_payments" ADD CONSTRAINT "qs_payments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
