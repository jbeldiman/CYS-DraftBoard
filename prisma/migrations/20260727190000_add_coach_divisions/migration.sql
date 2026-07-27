-- Separate account role from draft-coach participation and assign coaches to a division.
ALTER TABLE "User"
ADD COLUMN "isDraftCoach" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "coachDivision" "DraftDivision";

-- Existing coach accounts remain visible until the Admin clears/reassigns them.
UPDATE "User"
SET "isDraftCoach" = true
WHERE "role" = 'COACH';

ALTER TABLE "AccessRequest"
ADD COLUMN "requestedDivision" "DraftDivision";

CREATE INDEX "User_isDraftCoach_coachDivision_coachOrder_idx"
ON "User"("isDraftCoach", "coachDivision", "coachOrder");
