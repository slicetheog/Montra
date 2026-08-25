-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "sourceTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "assignments_sourceTransactionId_idx" ON "assignments"("sourceTransactionId");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
