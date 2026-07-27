-- Add independent seasonal coach access so a user may coach U11, U13, or both
-- while retaining BOARD or ADMIN privileges.
ALTER TABLE "User"
ADD COLUMN "coachesU11" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "coachesU13" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "u11CoachOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "u13CoachOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve every existing single-division assignment and order.
UPDATE "User"
SET
  "coachesU11" = CASE WHEN "isDraftCoach" = true AND "coachDivision" = 'U11' THEN true ELSE false END,
  "coachesU13" = CASE WHEN "isDraftCoach" = true AND "coachDivision" = 'U13' THEN true ELSE false END,
  "u11CoachOrder" = CASE WHEN "isDraftCoach" = true AND "coachDivision" = 'U11' THEN "coachOrder" ELSE 0 END,
  "u13CoachOrder" = CASE WHEN "isDraftCoach" = true AND "coachDivision" = 'U13' THEN "coachOrder" ELSE 0 END;

CREATE INDEX "User_coachesU11_u11CoachOrder_idx"
ON "User"("coachesU11", "u11CoachOrder");

CREATE INDEX "User_coachesU13_u13CoachOrder_idx"
ON "User"("coachesU13", "u13CoachOrder");
