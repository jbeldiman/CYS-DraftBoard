/*
  Warnings:

  - A unique constraint covering the columns `[draftEventId,evalNumber]` on the table `DraftPlayer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DraftPlayer" ADD COLUMN     "evalAttended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "evalNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "DraftPlayer_draftEventId_evalNumber_key" ON "DraftPlayer"("draftEventId", "evalNumber");
