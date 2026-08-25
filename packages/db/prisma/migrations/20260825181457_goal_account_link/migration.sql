-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "accountId" TEXT;

-- CreateIndex
CREATE INDEX "goals_accountId_idx" ON "goals"("accountId");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
