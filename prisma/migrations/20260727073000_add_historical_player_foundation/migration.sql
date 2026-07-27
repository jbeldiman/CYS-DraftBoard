-- This migration is intentionally additive. It does not delete or rewrite
-- any existing draft event, player, team, pick, board, trade, or user data.

-- Extend the event lifecycle so completed historical drafts can be locked.
ALTER TYPE "DraftPhase" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- Add season and division metadata for independently managed draft events.
CREATE TYPE "DraftSeason" AS ENUM ('SPRING', 'FALL');
CREATE TYPE "DraftDivision" AS ENUM ('U11', 'U13');

ALTER TABLE "DraftEvent"
ADD COLUMN "slug" TEXT,
ADD COLUMN "scheduledDateKnown" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "seasonYear" INTEGER,
ADD COLUMN "season" "DraftSeason",
ADD COLUMN "division" "DraftDivision",
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "sourceFile" TEXT,
ADD COLUMN "sourceHash" TEXT;

CREATE UNIQUE INDEX "DraftEvent_slug_key" ON "DraftEvent"("slug");

-- Permanent identity shared by a child's records across seasons and divisions.
CREATE TABLE "PermanentPlayer" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermanentPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermanentPlayer_identityKey_key" ON "PermanentPlayer"("identityKey");
CREATE INDEX "PermanentPlayer_normalizedName_idx" ON "PermanentPlayer"("normalizedName");
CREATE INDEX "PermanentPlayer_dob_idx" ON "PermanentPlayer"("dob");

-- DraftPlayer remains the season/event participation record. These fields link
-- it to the permanent identity and provide one season-neutral rating value.
ALTER TABLE "DraftPlayer"
ADD COLUMN "permanentPlayerId" TEXT,
ADD COLUMN "rating" INTEGER;

CREATE INDEX "DraftPlayer_permanentPlayerId_idx" ON "DraftPlayer"("permanentPlayerId");

ALTER TABLE "DraftPlayer"
ADD CONSTRAINT "DraftPlayer_permanentPlayerId_fkey"
FOREIGN KEY ("permanentPlayerId") REFERENCES "PermanentPlayer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
