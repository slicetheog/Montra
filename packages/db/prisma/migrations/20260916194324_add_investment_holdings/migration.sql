-- CreateTable
CREATE TABLE "holdings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costBasisCents" INTEGER,
    "currentPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_snapshots" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holding_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holdings_accountId_idx" ON "holdings"("accountId");

-- CreateIndex
CREATE INDEX "holding_snapshots_holdingId_recordedAt_idx" ON "holding_snapshots"("holdingId", "recordedAt");

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
