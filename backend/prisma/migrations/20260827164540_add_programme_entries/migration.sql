-- CreateTable
CREATE TABLE "programme_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodDate" DATE NOT NULL,
    "plannedProgress" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programme_entries_projectId_periodDate_key" ON "programme_entries"("projectId", "periodDate");

-- AddForeignKey
ALTER TABLE "programme_entries" ADD CONSTRAINT "programme_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_entries" ADD CONSTRAINT "programme_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
