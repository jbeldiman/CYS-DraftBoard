-- CreateTable
CREATE TABLE "DraftBoard" (
    "id" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftBoard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftBoard_draftEventId_teamId_idx" ON "DraftBoard"("draftEventId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftBoard_draftEventId_teamId_key" ON "DraftBoard"("draftEventId", "teamId");

-- AddForeignKey
ALTER TABLE "DraftBoard" ADD CONSTRAINT "DraftBoard_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftBoard" ADD CONSTRAINT "DraftBoard_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
