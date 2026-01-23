-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'BOARD', 'COACH', 'PARENT');

-- CreateEnum
CREATE TYPE "DraftPhase" AS ENUM ('SETUP', 'LIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AccessRequestType" AS ENUM ('COACH', 'BOARD');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PARENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccessRequestType" NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNotes" TEXT,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "DraftEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
    "registrationId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "dob" TIMESTAMP(3),
    "birthYear" INTEGER,
    "leagueChoice" TEXT,
    "wantsU13" BOOLEAN NOT NULL DEFAULT false,
    "jerseySize" TEXT,
    "guardian1Name" TEXT,
    "guardian2Name" TEXT,
    "primaryPhone" TEXT,
    "primaryEmail" TEXT,
    "notes" TEXT,
    "rank" INTEGER,
    "isDraftEligible" BOOLEAN NOT NULL DEFAULT false,
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
    "madeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AccessRequest_status_type_requestedAt_idx" ON "AccessRequest"("status", "type", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_userId_type_status_key" ON "AccessRequest"("userId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeam_draftEventId_order_key" ON "DraftTeam"("draftEventId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeam_draftEventId_name_key" ON "DraftTeam"("draftEventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPlayer_registrationId_key" ON "DraftPlayer"("registrationId");

-- CreateIndex
CREATE INDEX "DraftPlayer_draftEventId_isDraftEligible_isDrafted_idx" ON "DraftPlayer"("draftEventId", "isDraftEligible", "isDrafted");

-- CreateIndex
CREATE INDEX "DraftPlayer_draftEventId_lastName_firstName_idx" ON "DraftPlayer"("draftEventId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "DraftPick_draftEventId_teamId_idx" ON "DraftPick"("draftEventId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_overallNumber_key" ON "DraftPick"("draftEventId", "overallNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftEventId_playerId_key" ON "DraftPick"("draftEventId", "playerId");

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "DraftPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
