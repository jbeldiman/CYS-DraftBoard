import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getActiveDraftEventId } from "@/lib/activeDraftEvent";
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["COACH", "ADMIN", "BOARD"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          toTeamId?: string;
          givePlayerIds?: string[];
          receivePlayerIds?: string[];
          message?: string | null;
          fromTeamId?: string;
        }
      | null;

    const toTeamId = String(body?.toTeamId ?? "").trim();
    const givePlayerIds = uniqueIds(body?.givePlayerIds);
    const receivePlayerIds = uniqueIds(body?.receivePlayerIds);
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!toTeamId) {
      return NextResponse.json({ error: "Missing trade partner team" }, { status: 400 });
    }
    if (!givePlayerIds.length || !receivePlayerIds.length) {
      return NextResponse.json({ error: "Select players from both teams" }, { status: 400 });
    }
    if (givePlayerIds.some((id) => receivePlayerIds.includes(id))) {
      return NextResponse.json({ error: "A player cannot appear on both sides" }, { status: 400 });
    }

    const draftEventId = await getActiveDraftEventId();
    if (!draftEventId) {
      return NextResponse.json({ error: "No active draft event found" }, { status: 400 });
    }

    // Infer the user's team regardless of whether their primary role is COACH,
    // BOARD, or ADMIN. This supports Board/Admin users who also coach.
    const assignedTeam = await prisma.draftTeam.findFirst({
      where: { draftEventId, coachUserId: userId },
      select: { id: true },
    });

    let fromTeamId = assignedTeam?.id ?? null;
    if (!fromTeamId && (role === "ADMIN" || role === "BOARD")) {
      fromTeamId = String(body?.fromTeamId ?? "").trim() || null;
    }
    if (!fromTeamId) {
      return NextResponse.json({ error: "No team assigned to this account" }, { status: 400 });
    }
    if (fromTeamId === toTeamId) {
      return NextResponse.json({ error: "Cannot trade with your own team" }, { status: 400 });
    }

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId, id: { in: [fromTeamId, toTeamId] } },
      select: { id: true },
    });
    if (teams.length !== 2) {
      return NextResponse.json(
        { error: "One or both teams are invalid for the active draft" },
        { status: 400 }
      );
    }

    const giveCount = await prisma.draftPlayer.count({
      where: {
        draftEventId,
        id: { in: givePlayerIds },
        draftedTeamId: fromTeamId,
        isDrafted: true,
      },
    });
    if (giveCount !== givePlayerIds.length) {
      return NextResponse.json(
        { error: "One or more offered players are no longer on your roster" },
        { status: 409 }
      );
    }

    const receiveCount = await prisma.draftPlayer.count({
      where: {
        draftEventId,
        id: { in: receivePlayerIds },
        draftedTeamId: toTeamId,
        isDrafted: true,
      },
    });
    if (receiveCount !== receivePlayerIds.length) {
      return NextResponse.json(
        { error: "One or more requested players are no longer on the partner roster" },
        { status: 409 }
      );
    }

    const picks = await prisma.draftPick.findMany({
      where: {
        draftEventId,
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
        { error: "Every traded player must have an original draft round" },
        { status: 400 }
      );
    }

    const fromAvgRound = avg(giveRounds);
    const toAvgRound = avg(receiveRounds);
    const roundDelta =
      fromAvgRound != null && toAvgRound != null ? Math.abs(fromAvgRound - toAvgRound) : null;

    if (roundDelta == null || roundDelta > 2) {
      return NextResponse.json(
        { error: "Trade is not fair enough (average rounds must be within 2)" },
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
        message: message || null,
        fromAvgRound,
        toAvgRound,
        roundDelta,
        items: {
          create: [
            ...givePlayerIds.map((playerId) => ({ playerId, side: "FROM_GIVES" as const })),
            ...receivePlayerIds.map((playerId) => ({ playerId, side: "TO_GIVES" as const })),
          ],
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, tradeId: created.id });
  } catch (error: any) {
    console.error("Trade propose error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to propose trade" },
      { status: 500 }
    );
  }
}
