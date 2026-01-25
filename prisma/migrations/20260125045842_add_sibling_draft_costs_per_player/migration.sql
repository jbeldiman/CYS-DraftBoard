-- CreateTable
CREATE TABLE "SiblingDraftCost" (
    "id" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "draftCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiblingDraftCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiblingDraftCost_draftEventId_groupKey_idx" ON "SiblingDraftCost"("draftEventId", "groupKey");

-- CreateIndex
CREATE INDEX "SiblingDraftCost_draftEventId_idx" ON "SiblingDraftCost"("draftEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SiblingDraftCost_draftEventId_playerId_key" ON "SiblingDraftCost"("draftEventId", "playerId");

-- AddForeignKey
ALTER TABLE "SiblingDraftCost" ADD CONSTRAINT "SiblingDraftCost_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiblingDraftCost" ADD CONSTRAINT "SiblingDraftCost_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "DraftPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
