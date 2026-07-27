import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveDraftEvent } from "@/lib/activeDraftEvent";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

async function latestEventId() {
  return (await getOrCreateActiveDraftEvent()).id;
}

async function rosterWithRounds(draftEventId: string, teamId: string) {
  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId, draftedTeamId: teamId, isDrafted: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fullName: true, firstName: true, lastName: true },
  });

  if (!players.length) return [];

  const picks = await prisma.draftPick.findMany({
    where: { draftEventId, playerId: { in: players.map((player) => player.id) } },
    select: { playerId: true, round: true },
  });
  const roundByPlayer = new Map<string, number>();
  for (const pick of picks) roundByPlayer.set(pick.playerId, pick.round);

  return players.map((player) => ({
    ...player,
    round: roundByPlayer.get(player.id) ?? null,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["COACH", "ADMIN", "BOARD"].includes(role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // A user's primary role may be BOARD or ADMIN while they also coach a team.
  // Team assignment, not the primary role string, determines coach capabilities.
  const myTeam = await prisma.draftTeam.findFirst({
    where: { draftEventId, coachUserId: userId },
    select: { id: true, name: true, order: true },
  });
  const myRoster = myTeam ? await rosterWithRounds(draftEventId, myTeam.id) : [];

  return NextResponse.json({
    draftEventId,
    role,
    me: { id: userId },
    teams,
    myTeam,
    myRoster,
  });
}
