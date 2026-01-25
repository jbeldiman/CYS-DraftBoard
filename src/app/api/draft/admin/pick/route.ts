import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function snakeSlot(round: number, teamIndex: number, teamCount: number) {
  const reverse = round % 2 === 0;
  const posInRound = reverse ? teamCount - 1 - teamIndex : teamIndex; 
  const pickInRound = posInRound + 1;
  const overallNumber = (round - 1) * teamCount + posInRound + 1;
  return { pickInRound, overallNumber };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const teamId = String(body.teamId ?? "");
  const playerId = String(body.playerId ?? "");
  const round = Number(body.round ?? 0);

  if (!teamId || !playerId || !Number.isFinite(round) || round < 1) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const event =
      (await prisma.draftEvent.findFirst({
        where: { phase: "LIVE" },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.draftEvent.findFirst({
        orderBy: { updatedAt: "desc" },
      }));

    if (!event) return NextResponse.json({ error: "No event found" }, { status: 400 });

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId: event.id },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    const teamIndex = teams.findIndex((t) => t.id === teamId);
    if (teamIndex < 0) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const teamCount = teams.length;
    const { pickInRound, overallNumber } = snakeSlot(round, teamIndex, teamCount);

    const player = await prisma.draftPlayer.findUnique({
      where: { id: playerId },
      select: { id: true, draftEventId: true, isDraftEligible: true, isDrafted: true },
    });

    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    if (player.draftEventId !== event.id) {
      return NextResponse.json({ error: "Player is not in this draft event" }, { status: 400 });
    }
    if (!player.isDraftEligible) return NextResponse.json({ error: "Player is not draft-eligible" }, { status: 400 });
    if (player.isDrafted) return NextResponse.json({ error: "Player already drafted" }, { status: 409 });

    const slotExisting = await prisma.draftPick.findFirst({
      where: { draftEventId: event.id, teamId, round },
      select: { id: true },
    });
    if (slotExisting) {
      return NextResponse.json({ error: "That team already has a pick in this round" }, { status: 409 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const pick = await tx.draftPick.create({
        data: {
          draftEventId: event.id,
          teamId,
          playerId,
          round,
          pickInRound,
          overallNumber,
          madeAt: new Date(),
        },
        select: { id: true },
      });

      await tx.draftPlayer.update({
        where: { id: playerId },
        data: {
          isDrafted: true,
          draftedTeamId: teamId,
          draftedAt: new Date(),
        },
      });

      return pick;
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create pick" }, { status: 500 });
  }
}
