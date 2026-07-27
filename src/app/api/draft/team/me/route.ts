import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveDraftEvent } from "@/lib/activeDraftEvent";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

async function latestEventId() {
  return (await getOrCreateActiveDraftEvent()).id;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const draftEventId = await latestEventId();

  const team = await prisma.draftTeam.findFirst({
    where: { draftEventId, coachUserId: userId },
    select: { id: true, name: true, order: true },
  });

  if (!team) return NextResponse.json({ team: null, players: [] });

  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId, draftedTeamId: team.id, isDrafted: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      dob: true,
      gender: true,
      jerseySize: true,
      guardian1Name: true,
      guardian2Name: true,
      primaryPhone: true,
      primaryEmail: true,
    },
  });

  return NextResponse.json({ team, players });
}
