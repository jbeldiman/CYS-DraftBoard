-- CreateEnum
CREATE TYPE "DraftPhase" AS ENUM ('SETUP', 'LIVE', 'COMPLETE');

-- CreateTable
CREATE TABLE "DraftEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'CYS Draft Night',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "phase" "DraftPhase" NOT NULL DEFAULT 'SETUP',
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "pickClockSeconds" INTEGER NOT NULL DEFAULT 120,
    "isPaused" BOOLEAN NOT NULL DEFAULT true,
    "clockEndsAt" TIMESTAMP(3),
    "pauseRemainingSecs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftTeam" (
    "id" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "coachUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPlayer" (
    "id" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "notes" TEXT,
    "rank" INTEGER,
    "isDrafted" BOOLEAN NOT NULL DEFAULT false,
    "draftedTeamId" TEXT,
    "draftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL,
    "draftEventId" TEXT NOT NULL,
    "overallNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "pickInRound" INTEGER NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "madeByUserId" TEXT,
    "madeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeam_draftEventId_order_key" ON "DraftTeam"("draftEventId", "order");

-- CreateIndex
CREATE INDEX "DraftPlayer_draftEventId_isDrafted_idx" ON "DraftPlayer"("draftEventId", "isDrafted");

-- CreateIndex
CREATE INDEX "DraftPlayer_draftEventId_fullName_idx" ON "DraftPlayer"("draftEventId", "fullName");

-- CreateIndex
CREATE INDEX "DraftPick_draftEventId_madeAt_idx" ON "DraftPick"("draftEventId", "madeAt");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_overallNumber_key" ON "DraftPick"("draftEventId", "overallNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_playerId_key" ON "DraftPick"("draftEventId", "playerId");

-- AddForeignKey
ALTER TABLE "DraftTeam" ADD CONSTRAINT "DraftTeam_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftTeam" ADD CONSTRAINT "DraftTeam_coachUserId_fkey" FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlayer" ADD CONSTRAINT "DraftPlayer_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPlayer" ADD CONSTRAINT "DraftPlayer_draftedTeamId_fkey" FOREIGN KEY ("draftedTeamId") REFERENCES "DraftTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftEventId_fkey" FOREIGN KEY ("draftEventId") REFERENCES "DraftEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DraftTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "DraftPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_madeByUserId_fkey" FOREIGN KEY ("madeByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
