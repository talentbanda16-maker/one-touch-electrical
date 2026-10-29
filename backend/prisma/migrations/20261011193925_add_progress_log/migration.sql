-- CreateTable
CREATE TABLE "progress_logs" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "percentage" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "progress_logs" ADD CONSTRAINT "progress_logs_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "progress_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_logs" ADD CONSTRAINT "progress_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
