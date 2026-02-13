import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

async function latestEventId() {
  const live = await prisma.draftEvent.findFirst({
    where: { phase: "LIVE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (live?.id) return live.id;

  const e = await prisma.draftEvent.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!e?.id) {
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

  return e.id;
}

async function rosterWithRounds(draftEventId: string, teamId: string) {
  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId, draftedTeamId: teamId, isDrafted: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fullName: true, firstName: true, lastName: true },
  });

  const picks = await prisma.draftPick.findMany({
    where: { draftEventId, playerId: { in: players.map((p) => p.id) } },
    select: { playerId: true, round: true },
  });

  const roundByPlayer = new Map<string, number>();
  for (const p of picks) roundByPlayer.set(p.playerId, p.round);

  return players.map((p) => ({
    ...p,
    round: roundByPlayer.get(p.id) ?? null,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = role === "COACH" || role === "ADMIN" || role === "BOARD";
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const draftEventId = await latestEventId();

  const teams = await prisma.draftTeam.findMany({
    where: { draftEventId },
    orderBy: [{ order: "asc" }],
    select: {
      id: true,
      name: true,
      order: true,
      coachUserId: true,
      coachUser: { select: { id: true, name: true, email: true } },
    },
  });

  let myTeam: { id: string; name: string; order: number } | null = null;
  let myRoster: any[] = [];

  if (role === "COACH") {
    const t = await prisma.draftTeam.findFirst({
      where: { draftEventId, coachUserId: userId },
      select: { id: true, name: true, order: true },
    });
    if (t) {
      myTeam = t;
      myRoster = await rosterWithRounds(draftEventId, t.id);
    }
  }

  return NextResponse.json({
    draftEventId,
    role,
    me: { id: userId },
    teams,
    myTeam,
    myRoster,
  });
}
