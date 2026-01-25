import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function jsonErr(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function snakeTeamIndexFromOverallPick(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return { round: 1, index: 0, posInRound: 0 };
  const p0 = overallPick1 - 1;
  const round = Math.floor(p0 / teamCount) + 1;
  const posInRound = p0 % teamCount;
  const isReverse = round % 2 === 0;
  const index = isReverse ? teamCount - 1 - posInRound : posInRound;
  return { round, index, posInRound };
}

function snakePickInRoundFromOverall(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return 1;
  const p0 = overallPick1 - 1;
  return (p0 % teamCount) + 1;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return jsonErr("Unauthorized", 401);

  const role = (session.user as any).role as string | undefined;
  const userId = (session.user as any).id as string | undefined;

  if (!userId) return jsonErr("Unauthorized", 401);
  if (role !== "COACH") return jsonErr("Forbidden", 403);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const playerId = body?.playerId as string | undefined;
  if (!playerId) return jsonErr("Missing playerId", 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const event =
        (await tx.draftEvent.findFirst({
          where: { phase: "LIVE" },
          orderBy: { updatedAt: "desc" },
        })) ??
        (await tx.draftEvent.findFirst({
          orderBy: { updatedAt: "desc" },
        }));

      if (!event) throw new Error("No draft event found.");
      if (event.phase !== "LIVE") throw new Error("Draft is not live.");
      if (event.isPaused) throw new Error("Draft is paused.");

      const teams = await tx.draftTeam.findMany({
        where: { draftEventId: event.id },
        orderBy: [{ order: "asc" }],
        select: { id: true, name: true, order: true, coachUserId: true },
      });

      if (!teams.length) throw new Error("No teams found for this draft event.");

      const overall = event.currentPick ?? 1;
      const teamCount = teams.length;

      const { round, index } = snakeTeamIndexFromOverallPick(overall, teamCount);
      const pickInRound = snakePickInRoundFromOverall(overall, teamCount);

      const onClockTeam = teams[index];
      if (!onClockTeam) throw new Error("Unable to resolve on-clock team.");

      if (onClockTeam.coachUserId !== userId) {
        throw new Error("It is not your team's turn to pick.");
      }

      const player = await tx.draftPlayer.findFirst({
        where: {
          id: playerId,
          draftEventId: event.id,
        },
        select: {
          id: true,
          fullName: true,
          isDraftEligible: true,
          isDrafted: true,
        },
      });

      if (!player) throw new Error("Player not found for this draft event.");
      if (!player.isDraftEligible) throw new Error("That player is not draft eligible.");
      if (player.isDrafted) throw new Error("That player has already been drafted.");

      const existingPick = await tx.draftPick.findFirst({
        where: { draftEventId: event.id, playerId },
        select: { id: true },
      });
      if (existingPick) throw new Error("That player has already been drafted.");

      const existingSlot = await tx.draftPick.findFirst({
        where: {
          draftEventId: event.id,
          teamId: onClockTeam.id,
          round,
          pickInRound,
        },
        select: { id: true },
      });
      if (existingSlot) throw new Error("This pick slot is already filled.");

      const now = new Date();

      const pick = await tx.draftPick.create({
        data: {
          draftEventId: event.id,
          teamId: onClockTeam.id,
          playerId,
          overallNumber: overall,
          round,
          pickInRound,
          madeAt: now,
        },
        select: {
          id: true,
          overallNumber: true,
          round: true,
          pickInRound: true,
          madeAt: true,
          team: { select: { id: true, name: true, order: true } },
          player: { select: { id: true, fullName: true, rank: true } },
        },
      });

      await tx.draftPlayer.update({
        where: { id: playerId },
        data: {
          isDrafted: true,
          draftedTeamId: onClockTeam.id,
          draftedAt: now,
        },
      });

      const nextOverall = overall + 1;
      const endsAt = new Date(now.getTime() + (event.pickClockSeconds ?? 120) * 1000);

      await tx.draftEvent.update({
        where: { id: event.id },
        data: {
          currentPick: nextOverall,
          clockEndsAt: endsAt,
        },
      });

      return { pick };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const msg = e?.message ?? "Failed to draft player";
    const status =
      msg.includes("Unauthorized") ||
      msg.includes("Forbidden")
        ? 403
        : msg.includes("not live") ||
          msg.includes("paused") ||
          msg.includes("turn") ||
          msg.includes("eligible") ||
          msg.includes("already") ||
          msg.includes("Missing") ||
          msg.includes("not found") ||
          msg.includes("No teams")
        ? 400
        : 500;

    console.error("POST /api/draft/pick error:", e);
    return NextResponse.json({ error: msg }, { status });
  }
}
