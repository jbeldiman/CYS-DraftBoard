import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function getOrCreateDraftEvent() {
  const existing = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing?.id) return existing.id;

  const created = await prisma.draftEvent.create({
    data: {
      name: "CYS Draft Night",
      scheduledAt: new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
      phase: "SETUP",
      currentPick: 1,
      pickClockSeconds: 120,
      isPaused: true,
    },
    select: { id: true },
  });

  return created.id;
}

export async function GET() {
  const draftEventId = await getOrCreateDraftEvent();

  const [event, teams, picks, undraftedCount, draftedCount] = await Promise.all([
    prisma.draftEvent.findUnique({
      where: { id: draftEventId },
      select: {
        id: true,
        name: true,
        scheduledAt: true,
        phase: true,
        currentPick: true,
        pickClockSeconds: true,
        isPaused: true,
        clockEndsAt: true,
        pauseRemainingSecs: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.draftTeam.findMany({
      where: { draftEventId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        coachUserId: true,
        coachUser: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.draftPick.findMany({
      where: { draftEventId },
      orderBy: { overallNumber: "desc" },
      take: 20,
      select: {
        id: true,
        overallNumber: true,
        round: true,
        pickInRound: true,
        madeAt: true,
        team: { select: { id: true, name: true, order: true } },
        player: { select: { id: true, fullName: true, rank: true } },
      },
    }),
    prisma.draftPlayer.count({ where: { draftEventId, isDrafted: false } }),
    prisma.draftPlayer.count({ where: { draftEventId, isDrafted: true } }),
  ]);

  return NextResponse.json({
    event,
    teams,
    recentPicks: picks,
    counts: { undrafted: undraftedCount, drafted: draftedCount },
  });
}