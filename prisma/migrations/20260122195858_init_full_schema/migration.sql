/*
  Warnings:

  - You are about to drop the column `madeByUserId` on the `DraftPick` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `DraftBoard` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[registrationId]` on the table `DraftPlayer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[draftEventId,name]` on the table `DraftTeam` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `firstName` to the `DraftPlayer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `DraftPlayer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PARENT';

-- DropForeignKey
ALTER TABLE "DraftBoard" DROP CONSTRAINT "DraftBoard_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_madeByUserId_fkey";

-- DropForeignKey
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_playerId_fkey";

-- DropForeignKey
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_teamId_fkey";

-- DropIndex
DROP INDEX "DraftPick_draftEventId_madeAt_idx";

-- DropIndex
DROP INDEX "DraftPlayer_draftEventId_fullName_idx";

-- DropIndex
DROP INDEX "DraftPlayer_draftEventId_isDrafted_idx";

-- AlterTable
ALTER TABLE "DraftEvent" ALTER COLUMN "name" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DraftPick" DROP COLUMN "madeByUserId";

-- AlterTable
ALTER TABLE "DraftPlayer" ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "guardian1Name" TEXT,
ADD COLUMN     "guardian2Name" TEXT,
ADD COLUMN     "isDraftEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "jerseySize" TEXT,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "leagueChoice" TEXT,
ADD COLUMN     "primaryEmail" TEXT,
ADD COLUMN     "primaryPhone" TEXT,
ADD COLUMN     "registrationId" TEXT,
ADD COLUMN     "wantsU13" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "passwordHash" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'PARENT';

-- DropTable
DROP TABLE "DraftBoard";

-- CreateIndex
CREATE INDEX "DraftPick_draftEventId_teamId_idx" ON "DraftPick"("draftEventId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPlayer_registrationId_key" ON "DraftPlayer"("registrationId");

-- CreateIndex
CREATE INDEX "DraftPlayer_draftEventId_isDraftEligible_isDrafted_idx" ON "DraftPlayer"("draftEventId", "isDraftEligible", "isDrafted");

-- CreateIndex
CREATE INDEX "DraftPlayer_draftEventId_lastName_firstName_idx" ON "DraftPlayer"("draftEventId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "DraftTeam_draftEventId_name_key" ON "DraftTeam"("draftEventId", "name");

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "DraftTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "DraftPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
