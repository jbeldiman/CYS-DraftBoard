-- Viewer access is additive, just like Board and division coaching access.
ALTER TABLE "User"
ADD COLUMN "isViewer" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "AccessRequestType" ADD VALUE IF NOT EXISTS 'VIEWER';

CREATE INDEX "User_isViewer_idx" ON "User"("isViewer");
