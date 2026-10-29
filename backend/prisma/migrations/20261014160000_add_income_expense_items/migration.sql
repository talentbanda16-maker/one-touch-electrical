CREATE TABLE "income_items" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "income_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "income_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
);

CREATE TABLE "expense_items" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount"      DECIMAL(14,2) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE
);
