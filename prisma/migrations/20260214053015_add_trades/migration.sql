-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('FROM_GIVES', 'TO_GIVES');

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT NOT NULL,
    "respondedByUserId" TEXT,
    "parentTradeId" TEXT,
    "fromAvgRound" DOUBLE PRECISION,
    "toAvgRound" DOUBLE PRECISION,
    "roundDelta" DOUBLE PRECISION,
    "message" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeItem" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,

    CONSTRAINT "TradeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_draftEventId_status_updatedAt_idx" ON "Trade"("draftEventId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Trade_fromTeamId_status_updatedAt_idx" ON "Trade"("fromTeamId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Trade_toTeamId_status_updatedAt_idx" ON "Trade"("toTeamId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TradeItem_tradeId_side_idx" ON "TradeItem"("tradeId", "side");

-- CreateIndex
CREATE INDEX "TradeItem_playerId_idx" ON "TradeItem"("playerId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_parentTradeId_fkey" FOREIGN KEY ("parentTradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "DraftPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
