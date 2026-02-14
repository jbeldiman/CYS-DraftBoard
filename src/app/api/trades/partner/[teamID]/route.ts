import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

async function rosterWithRounds(draftEventId: string, teamId: string) {
  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId, draftedTeamId: teamId, isDrafted: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, fullName: true, firstName: true, lastName: true },
  });

  if (!players.length) return [];

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

export async function GET(req: NextRequest, context: any) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["COACH", "ADMIN", "BOARD"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }


    const params = (await context?.params) ?? context?.params ?? {};
    const teamId: string | undefined = params.teamID ?? params.teamId ?? params.id;

    if (!teamId) {
      return NextResponse.json(
        { error: "Missing team id", debug: { params } },
        { status: 400 }
      );
    }

    const team = await prisma.draftTeam.findUnique({
      where: { id: teamId },
      select: { id: true, draftEventId: true },
    });

    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const players = await rosterWithRounds(team.draftEventId, team.id);
    return NextResponse.json({ players });
  } catch (err: any) {
    console.error("Partner roster error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to load partner roster" },
      { status: 500 }
    );
  }
}
