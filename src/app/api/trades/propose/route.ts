import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
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

function avg(nums: number[]) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "COACH" && role !== "ADMIN" && role !== "BOARD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const toTeamId = String(body?.toTeamId ?? "");
  const givePlayerIds = Array.isArray(body?.givePlayerIds) ? body.givePlayerIds.map(String) : [];
  const receivePlayerIds = Array.isArray(body?.receivePlayerIds) ? body.receivePlayerIds.map(String) : [];
  const message = body?.message != null ? String(body.message).slice(0, 400) : null;

  if (!toTeamId) return NextResponse.json({ error: "Missing toTeamId" }, { status: 400 });
  if (!givePlayerIds.length || !receivePlayerIds.length) {
    return NextResponse.json({ error: "Select players from both teams" }, { status: 400 });
  }

  const draftEventId = await latestEventId();


  let fromTeamId: string | null = null;
  if (role === "COACH") {
    const myTeam = await prisma.draftTeam.findFirst({
      where: { draftEventId, coachUserId: userId },
      select: { id: true },
    });
    if (!myTeam) return NextResponse.json({ error: "No team assigned to this coach yet" }, { status: 400 });
    fromTeamId = myTeam.id;
  } else {

    const passed = String(body?.fromTeamId ?? "");
    if (!passed) return NextResponse.json({ error: "Missing fromTeamId" }, { status: 400 });
    fromTeamId = passed;
  }

  if (fromTeamId === toTeamId) return NextResponse.json({ error: "Choose a different team" }, { status: 400 });

  const [fromTeam, toTeam] = await Promise.all([
    prisma.draftTeam.findFirst({ where: { id: fromTeamId, draftEventId }, select: { id: true } }),
    prisma.draftTeam.findFirst({ where: { id: toTeamId, draftEventId }, select: { id: true } }),
  ]);

  if (!fromTeam || !toTeam) return NextResponse.json({ error: "Invalid teams" }, { status: 400 });

  
  const givePlayers = await prisma.draftPlayer.findMany({
    where: { id: { in: givePlayerIds }, draftEventId, draftedTeamId: fromTeamId, isDrafted: true },
    select: { id: true },
  });
  if (givePlayers.length !== givePlayerIds.length) {
    return NextResponse.json({ error: "One or more 'giving' players are not on your roster" }, { status: 400 });
  }

  const receivePlayers = await prisma.draftPlayer.findMany({
    where: { id: { in: receivePlayerIds }, draftEventId, draftedTeamId: toTeamId, isDrafted: true },
    select: { id: true },
  });
  if (receivePlayers.length !== receivePlayerIds.length) {
    return NextResponse.json({ error: "One or more 'receiving' players are not on the other roster" }, { status: 400 });
  }

  const picks = await prisma.draftPick.findMany({
    where: {
      draftEventId,
      playerId: { in: [...givePlayerIds, ...receivePlayerIds] },
    },
    select: { playerId: true, round: true },
  });

  const roundByPlayer = new Map<string, number>();
  for (const p of picks) roundByPlayer.set(p.playerId, p.round);

  const giveRounds = givePlayerIds.map((id: string) => roundByPlayer.get(id)).filter((v): v is number => typeof v === "number");
  const receiveRounds = receivePlayerIds
    .map((id: string) => roundByPlayer.get(id))
    .filter((v): v is number => typeof v === "number");

  if (giveRounds.length !== givePlayerIds.length || receiveRounds.length !== receivePlayerIds.length) {
    return NextResponse.json({ error: "Missing draft round data for one or more players" }, { status: 400 });
  }

  const fromAvgRound = avg(giveRounds);
  const toAvgRound = avg(receiveRounds);

  if (fromAvgRound == null || toAvgRound == null) {
    return NextResponse.json({ error: "Unable to compute trade fairness" }, { status: 400 });
  }

  const roundDelta = Math.abs(fromAvgRound - toAvgRound);

  if (roundDelta > 2) {
    return NextResponse.json(
      { error: "Trade is not fair enough (avg rounds must be within 2)", fromAvgRound, toAvgRound, roundDelta },
      { status: 400 }
    );
  }

  const created = await prisma.trade.create({
    data: {
      draftEventId,
      fromTeamId,
      toTeamId,
      status: "PENDING",
      createdByUserId: userId,
      fromAvgRound,
      toAvgRound,
      roundDelta,
      message: message ?? undefined,
      items: {
        create: [
          ...givePlayerIds.map((playerId: string) => ({ playerId, side: "FROM_GIVES" as const })),
          ...receivePlayerIds.map((playerId: string) => ({ playerId, side: "TO_GIVES" as const })),
        ],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, tradeId: created.id });
}
