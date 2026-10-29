-- AlterTable
ALTER TABLE "stock_transaction_lines" ADD COLUMN     "bomItemId" TEXT;

-- AddForeignKey
ALTER TABLE "stock_transaction_lines" ADD CONSTRAINT "stock_transaction_lines_bomItemId_fkey" FOREIGN KEY ("bomItemId") REFERENCES "bom_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
