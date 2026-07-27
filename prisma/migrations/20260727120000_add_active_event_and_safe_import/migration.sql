-- Add an explicit active-event selector so archived imports and multiple divisions
-- cannot accidentally become the draft used by the live application.
ALTER TABLE "DraftEvent"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the current working draft as the active event. Prefer LIVE, then the
-- most recently updated non-archived event.
UPDATE "DraftEvent"
SET "isActive" = true
WHERE "id" = (
  SELECT "id"
  FROM "DraftEvent"
  WHERE "phase" <> 'ARCHIVED'
  ORDER BY
    CASE WHEN "phase" = 'LIVE' THEN 0 ELSE 1 END,
    "updatedAt" DESC
  LIMIT 1
);

-- The application switches this flag transactionally so live routes use one
-- explicit event rather than whichever event happened to be created last.
CREATE INDEX "DraftEvent_isActive_phase_idx"
ON "DraftEvent" ("isActive", "phase");

-- Preserve the second guardian phone from the revised season files.
ALTER TABLE "DraftPlayer"
ADD COLUMN "guardian2Phone" TEXT;

-- The legacy editor used one broad group key per league, which could make
-- unrelated configured players look like siblings. Neutralize those rows;
-- saving a sibling cost or importing a new season rebuilds a family-specific key.
UPDATE "SiblingDraftCost"
SET "groupKey" = 'legacy:' || "playerId"
WHERE "groupKey" LIKE 'league:%';
