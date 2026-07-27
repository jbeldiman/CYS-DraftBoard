import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { getActiveDraftEventId } from "@/lib/activeDraftEvent";

export const runtime = "nodejs";

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
  const roundByPlayer = new Map(picks.map((pick) => [pick.playerId, pick.round]));

  return players.map((player) => ({
    ...player,
    round: roundByPlayer.get(player.id) ?? null,
  }));
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ teamID: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["COACH", "ADMIN", "BOARD"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { teamID } = await context.params;
    const teamId = String(teamID ?? "").trim();
    if (!teamId) return NextResponse.json({ error: "Missing team id" }, { status: 400 });

    const draftEventId = await getActiveDraftEventId();
    if (!draftEventId) {
      return NextResponse.json({ error: "No active draft event found" }, { status: 400 });
    }

    const team = await prisma.draftTeam.findFirst({
      where: { id: teamId, draftEventId },
      select: { id: true },
    });
    if (!team) {
      return NextResponse.json({ error: "Team not found in the active draft" }, { status: 404 });
    }

    const players = await rosterWithRounds(draftEventId, team.id);
    return NextResponse.json({ players });
  } catch (error: any) {
    console.error("Partner roster error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to load partner roster" },
      { status: 500 }
    );
  }
}
