-- CreateEnum
CREATE TYPE "GoalPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "priority" "GoalPriority" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "recurring_transactions" ADD COLUMN     "flaggedToCancel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalAmountCents" INTEGER;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "sourceRecurringId" TEXT;

-- CreateIndex
CREATE INDEX "transactions_sourceRecurringId_idx" ON "transactions"("sourceRecurringId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sourceRecurringId_fkey" FOREIGN KEY ("sourceRecurringId") REFERENCES "recurring_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
