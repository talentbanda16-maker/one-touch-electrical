-- CreateTable
CREATE TABLE "project_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "actualProgress" INTEGER NOT NULL,
    "plannedProgress" INTEGER,
    "fundUtilisationPercent" INTEGER,
    "totalFundsReceived" DECIMAL(14,2) NOT NULL,
    "totalExpenditure" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_snapshots_projectId_snapshotDate_key" ON "project_snapshots"("projectId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "project_snapshots" ADD CONSTRAINT "project_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
