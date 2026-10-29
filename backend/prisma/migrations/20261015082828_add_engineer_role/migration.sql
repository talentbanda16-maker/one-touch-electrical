-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ENGINEER';

-- DropForeignKey
ALTER TABLE "expense_items" DROP CONSTRAINT "expense_items_projectId_fkey";

-- DropForeignKey
ALTER TABLE "income_items" DROP CONSTRAINT "income_items_projectId_fkey";

-- AddForeignKey
ALTER TABLE "income_items" ADD CONSTRAINT "income_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
