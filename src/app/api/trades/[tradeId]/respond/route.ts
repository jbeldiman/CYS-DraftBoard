import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function avg(nums: number[]) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

export async function POST(req: NextRequest, context: any) {
  const tradeId = context.params.tradeId;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = role === "COACH" || role === "ADMIN" || role === "BOARD";
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    select: {
      id: true,
      draftEventId: true,
      fromTeamId: true,
      toTeamId: true,
      status: true,
      items: { select: { side: true, playerId: true } },
    },
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "").toUpperCase();

  if (role === "COACH") {
    const myTeam = await prisma.draftTeam.findFirst({
      where: { draftEventId: trade.draftEventId, coachUserId: userId },
      select: { id: true },
    });

    if (!myTeam) {
      return NextResponse.json({ error: "No team assigned to this coach yet" }, { status: 400 });
    }

    if (myTeam.id !== trade.toTeamId && myTeam.id !== trade.fromTeamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      (action === "ACCEPT" || action === "REJECT" || action === "COUNTER") &&
      myTeam.id !== trade.toTeamId
    ) {
      return NextResponse.json({ error: "Only the receiving coach can respond" }, { status: 403 });
    }
  }

  if (action === "REJECT") {
    if (trade.status !== "PENDING") {
      return NextResponse.json({ error: "Trade is not pending" }, { status: 400 });
    }

    await prisma.trade.update({
      where: { id: trade.id },
      data: { status: "REJECTED", respondedByUserId: userId },
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "ACCEPT") {
    if (trade.status !== "PENDING") {
      return NextResponse.json({ error: "Trade is not pending" }, { status: 400 });
    }

    const fromGives = trade.items.filter(i => i.side === "FROM_GIVES").map(i => i.playerId);
    const toGives = trade.items.filter(i => i.side === "TO_GIVES").map(i => i.playerId);

    const result = await prisma.$transaction(async tx => {
      const a = await tx.draftPlayer.updateMany({
        where: {
          id: { in: fromGives },
          draftEventId: trade.draftEventId,
          draftedTeamId: trade.fromTeamId,
          isDrafted: true,
        },
        data: { draftedTeamId: trade.toTeamId },
      });

      const b = await tx.draftPlayer.updateMany({
        where: {
          id: { in: toGives },
          draftEventId: trade.draftEventId,
          draftedTeamId: trade.toTeamId,
          isDrafted: true,
        },
        data: { draftedTeamId: trade.fromTeamId },
      });

      if (a.count !== fromGives.length || b.count !== toGives.length) {
        throw new Error("Roster changed before acceptance; please refresh and try again.");
      }

      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: "ACCEPTED",
          respondedByUserId: userId,
          executedAt: new Date(),
        },
      });

      return { ok: true };
    });

    return NextResponse.json(result);
  }

  if (action === "COUNTER") {
    if (trade.status !== "PENDING") {
      return NextResponse.json({ error: "Trade is not pending" }, { status: 400 });
    }

    const givePlayerIds = Array.isArray(body?.givePlayerIds) ? body.givePlayerIds.map(String) : [];
    const receivePlayerIds = Array.isArray(body?.receivePlayerIds) ? body.receivePlayerIds.map(String) : [];

    if (!givePlayerIds.length || !receivePlayerIds.length) {
      return NextResponse.json({ error: "Select players from both teams" }, { status: 400 });
    }

    const picks = await prisma.draftPick.findMany({
      where: {
        draftEventId: trade.draftEventId,
        playerId: { in: [...givePlayerIds, ...receivePlayerIds] },
      },
      select: { playerId: true, round: true },
    });

    const roundByPlayer = new Map<string, number>();
    for (const p of picks) roundByPlayer.set(p.playerId, p.round);

    const giveRounds = givePlayerIds
  .map((id: string) => roundByPlayer.get(id))
  .filter((v: number | undefined): v is number => typeof v === "number");

    const receiveRounds = receivePlayerIds
  .map((id: string) => roundByPlayer.get(id))
  .filter((v: number | undefined): v is number => typeof v === "number");


    const fromAvgRound = avg(giveRounds);
    const toAvgRound = avg(receiveRounds);
    const roundDelta = fromAvgRound != null && toAvgRound != null ? Math.abs(fromAvgRound - toAvgRound) : null;

    if (roundDelta == null || roundDelta > 2) {
      return NextResponse.json({ error: "Counter is not fair enough (avg rounds must be within 2)" }, { status: 400 });
    }

    const created = await prisma.$transaction(async tx => {
      await tx.trade.update({
        where: { id: trade.id },
        data: { status: "COUNTERED", respondedByUserId: userId },
      });

      return tx.trade.create({
        data: {
          draftEventId: trade.draftEventId,
          fromTeamId: trade.toTeamId,
          toTeamId: trade.fromTeamId,
          status: "PENDING",
          createdByUserId: userId,
          parentTradeId: trade.id,
          fromAvgRound,
          toAvgRound,
          roundDelta,
          items: {
            create: [
              ...givePlayerIds.map(playerId => ({ playerId, side: "FROM_GIVES" as const })),
              ...receivePlayerIds.map(playerId => ({ playerId, side: "TO_GIVES" as const })),
            ],
          },
        },
        select: { id: true },
      });
    });

    return NextResponse.json({ ok: true, counterTradeId: created.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
