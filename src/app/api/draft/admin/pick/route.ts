import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEvent() {
  const e = await prisma.draftEvent.findFirst({ orderBy: { createdAt: "desc" } });
  if (!e) throw new Error("No draft event found");
  return e;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const teamId = (body?.teamId ?? "").toString().trim();
  const playerId = (body?.playerId ?? "").toString().trim();

  if (!teamId || !playerId) {
    return NextResponse.json({ error: "teamId and playerId required" }, { status: 400 });
  }

  const e = await latestEvent();

  if (e.phase !== "LIVE") return NextResponse.json({ error: "Draft is not LIVE" }, { status: 400 });
  if (e.isPaused) return NextResponse.json({ error: "Draft is paused" }, { status: 400 });

  const teams = await prisma.draftTeam.findMany({
    where: { draftEventId: e.id },
    orderBy: { order: "asc" },
    select: { id: true, order: true, name: true },
  });

  if (teams.length === 0) return NextResponse.json({ error: "No teams configured" }, { status: 400 });

  const expectedIndex = (e.currentPick - 1) % teams.length;
  const expectedTeam = teams[expectedIndex];

  if (!expectedTeam || expectedTeam.id !== teamId) {
    return NextResponse.json(
      {
        error: "Not this team's turn",
        expectedTeam: expectedTeam ? { id: expectedTeam.id, name: expectedTeam.name, order: expectedTeam.order } : null,
        currentPick: e.currentPick,
      },
      { status: 400 }
    );
  }

  const player = await prisma.draftPlayer.findUnique({
    where: { id: playerId },
    select: { id: true, draftEventId: true, isDrafted: true, fullName: true },
  });

  if (!player || player.draftEventId !== e.id) return NextResponse.json({ error: "Invalid player" }, { status: 400 });
  if (player.isDrafted) return NextResponse.json({ error: "Player already drafted" }, { status: 400 });

  const overallNumber = e.currentPick;
  const round = Math.floor((overallNumber - 1) / teams.length) + 1;
  const pickInRound = ((overallNumber - 1) % teams.length) + 1;

  const now = new Date();
  const nextPick = overallNumber + 1;
  const nextClockEndsAt = new Date(now.getTime() + e.pickClockSeconds * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.draftEvent.findUnique({
      where: { id: e.id },
      select: { currentPick: true, isPaused: true, phase: true, pickClockSeconds: true },
    });

    if (!latest || latest.phase !== "LIVE" || latest.isPaused) throw new Error("Draft not available");
    if (latest.currentPick !== overallNumber) throw new Error("Pick already advanced");

    const pick = await tx.draftPick.create({
      data: {
        draftEventId: e.id,
        overallNumber,
        round,
        pickInRound,
        teamId,
        playerId,
        madeAt: now,
      },
      select: { id: true, overallNumber: true, round: true, pickInRound: true, madeAt: true },
    });

    await tx.draftPlayer.update({
      where: { id: playerId },
      data: {
        isDrafted: true,
        draftedTeamId: teamId,
        draftedAt: now,
      },
    });

    const event = await tx.draftEvent.update({
      where: { id: e.id },
      data: {
        currentPick: nextPick,
        clockEndsAt: nextClockEndsAt,
        pauseRemainingSecs: null,
      },
      select: {
        id: true,
        phase: true,
        currentPick: true,
        pickClockSeconds: true,
        isPaused: true,
        clockEndsAt: true,
      },
    });

    return { pick, event };
  });

  return NextResponse.json({ ...result });
}
