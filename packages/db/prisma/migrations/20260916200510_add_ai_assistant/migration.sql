-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "aiAssistantEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "monthly_recaps" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_recaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_recaps_budgetId_month_key" ON "monthly_recaps"("budgetId", "month");

-- AddForeignKey
ALTER TABLE "monthly_recaps" ADD CONSTRAINT "monthly_recaps_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
