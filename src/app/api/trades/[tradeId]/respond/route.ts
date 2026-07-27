import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((id) => id.trim()).filter(Boolean))];
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tradeId: string }> }
) {
  try {
    const { tradeId } = await context.params;
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["COACH", "ADMIN", "BOARD"].includes(role ?? "")) {
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
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? "").toUpperCase();
    if (!["ACCEPT", "REJECT", "COUNTER"].includes(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const myTeam = await prisma.draftTeam.findFirst({
      where: { draftEventId: trade.draftEventId, coachUserId: userId },
      select: { id: true },
    });

    // Admin may repair or finalize a trade. Everyone else must be the receiving coach,
    // including Board members whose primary role is BOARD but who also coach a team.
    if (role !== "ADMIN") {
      if (!myTeam) {
        return NextResponse.json({ error: "No team assigned to this account" }, { status: 400 });
      }
      if (myTeam.id !== trade.fromTeamId && myTeam.id !== trade.toTeamId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (myTeam.id !== trade.toTeamId) {
        return NextResponse.json(
          { error: "Only the receiving coach can accept, reject, or counter" },
          { status: 403 }
        );
      }
    }

    if (trade.status !== "PENDING") {
      return NextResponse.json({ error: "Trade is no longer pending" }, { status: 409 });
    }

    if (action === "REJECT") {
      const updated = await prisma.trade.updateMany({
        where: { id: trade.id, status: "PENDING" },
        data: { status: "REJECTED", respondedByUserId: userId },
      });
      if (updated.count !== 1) {
        return NextResponse.json({ error: "Trade was already handled" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "ACCEPT") {
      const fromGives = [...new Set(
        trade.items.filter((item) => item.side === "FROM_GIVES").map((item) => item.playerId)
      )];
      const toGives = [...new Set(
        trade.items.filter((item) => item.side === "TO_GIVES").map((item) => item.playerId)
      )];

      if (!fromGives.length || !toGives.length) {
        return NextResponse.json({ error: "Trade must include players from both teams" }, { status: 400 });
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const claimed = await tx.trade.updateMany({
            where: { id: trade.id, status: "PENDING" },
            data: {
              status: "ACCEPTED",
              respondedByUserId: userId,
              executedAt: new Date(),
            },
          });
          if (claimed.count !== 1) throw new Error("Trade was already handled");

          const movedFrom = await tx.draftPlayer.updateMany({
            where: {
              id: { in: fromGives },
              draftEventId: trade.draftEventId,
              draftedTeamId: trade.fromTeamId,
              isDrafted: true,
            },
            data: { draftedTeamId: trade.toTeamId },
          });
          const movedTo = await tx.draftPlayer.updateMany({
            where: {
              id: { in: toGives },
              draftEventId: trade.draftEventId,
              draftedTeamId: trade.toTeamId,
              isDrafted: true,
            },
            data: { draftedTeamId: trade.fromTeamId },
          });

          if (movedFrom.count !== fromGives.length || movedTo.count !== toGives.length) {
            throw new Error("Roster changed before acceptance; refresh and try again");
          }

          return { ok: true, movedPlayers: movedFrom.count + movedTo.count };
        },
        { maxWait: 10_000, timeout: 15_000 }
      );

      return NextResponse.json(result);
    }

    const givePlayerIds = uniqueIds(body?.givePlayerIds);
    const receivePlayerIds = uniqueIds(body?.receivePlayerIds);
    if (!givePlayerIds.length || !receivePlayerIds.length) {
      return NextResponse.json({ error: "Select players from both teams" }, { status: 400 });
    }
    if (givePlayerIds.some((id) => receivePlayerIds.includes(id))) {
      return NextResponse.json({ error: "A player cannot appear on both sides" }, { status: 400 });
    }

    // The receiving team becomes the sender of the counteroffer.
    const giveCount = await prisma.draftPlayer.count({
      where: {
        draftEventId: trade.draftEventId,
        id: { in: givePlayerIds },
        draftedTeamId: trade.toTeamId,
        isDrafted: true,
      },
    });
    const receiveCount = await prisma.draftPlayer.count({
      where: {
        draftEventId: trade.draftEventId,
        id: { in: receivePlayerIds },
        draftedTeamId: trade.fromTeamId,
        isDrafted: true,
      },
    });
    if (giveCount !== givePlayerIds.length || receiveCount !== receivePlayerIds.length) {
      return NextResponse.json(
        { error: "One or more counteroffer players are no longer on the expected roster" },
        { status: 409 }
      );
    }

    const picks = await prisma.draftPick.findMany({
      where: {
        draftEventId: trade.draftEventId,
        playerId: { in: [...givePlayerIds, ...receivePlayerIds] },
      },
      select: { playerId: true, round: true },
    });
    const roundByPlayer = new Map(picks.map((pick) => [pick.playerId, pick.round]));
    const giveRounds = givePlayerIds
      .map((id) => roundByPlayer.get(id))
      .filter((round): round is number => typeof round === "number");
    const receiveRounds = receivePlayerIds
      .map((id) => roundByPlayer.get(id))
      .filter((round): round is number => typeof round === "number");

    if (giveRounds.length !== givePlayerIds.length || receiveRounds.length !== receivePlayerIds.length) {
      return NextResponse.json(
        { error: "Every counteroffer player must have an original draft round" },
        { status: 400 }
      );
    }

    const fromAvgRound = avg(giveRounds);
    const toAvgRound = avg(receiveRounds);
    const roundDelta =
      fromAvgRound != null && toAvgRound != null ? Math.abs(fromAvgRound - toAvgRound) : null;
    if (roundDelta == null || roundDelta > 2) {
      return NextResponse.json(
        { error: "Counter is not fair enough (average rounds must be within 2)" },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.trade.updateMany({
          where: { id: trade.id, status: "PENDING" },
          data: { status: "COUNTERED", respondedByUserId: userId },
        });
        if (claimed.count !== 1) throw new Error("Trade was already handled");

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
                ...givePlayerIds.map((playerId) => ({
                  playerId,
                  side: "FROM_GIVES" as const,
                })),
                ...receivePlayerIds.map((playerId) => ({
                  playerId,
                  side: "TO_GIVES" as const,
                })),
              ],
            },
          },
          select: { id: true },
        });
      },
      { maxWait: 10_000, timeout: 15_000 }
    );

    return NextResponse.json({ ok: true, counterTradeId: created.id });
  } catch (error: any) {
    console.error("Trade response error:", error);
    const message = error?.message ?? "Failed to respond to trade";
    const status = /already handled|Roster changed/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
