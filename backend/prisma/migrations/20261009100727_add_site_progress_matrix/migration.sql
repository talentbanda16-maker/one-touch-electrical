-- CreateTable
CREATE TABLE "progress_rows" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_cells" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "progress_cells_rowId_projectId_key" ON "progress_cells"("rowId", "projectId");

-- AddForeignKey
ALTER TABLE "progress_cells" ADD CONSTRAINT "progress_cells_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "progress_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_cells" ADD CONSTRAINT "progress_cells_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
