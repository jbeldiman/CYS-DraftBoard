import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

async function latestEventId() {
  const live = await prisma.draftEvent.findFirst({
    where: { phase: "LIVE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (live?.id) return live.id;

  const e = await prisma.draftEvent.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return e?.id ?? null;
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

    const toTeamId = String(body?.toTeamId ?? "");
    const givePlayerIds = Array.isArray(body?.givePlayerIds) ? body!.givePlayerIds.map(String) : [];
    const receivePlayerIds = Array.isArray(body?.receivePlayerIds)
      ? body!.receivePlayerIds.map(String)
      : [];
    const message = typeof body?.message === "string" ? body!.message.trim() : "";

    if (!toTeamId) return NextResponse.json({ error: "Missing trade partner team" }, { status: 400 });
    if (!givePlayerIds.length || !receivePlayerIds.length) {
      return NextResponse.json({ error: "Select players from both teams" }, { status: 400 });
    }

    const draftEventId = await latestEventId();
    if (!draftEventId) return NextResponse.json({ error: "No draft event found" }, { status: 400 });

   
    let fromTeamId: string | null = null;

    if (role === "COACH") {
      const t = await prisma.draftTeam.findFirst({
        where: { draftEventId, coachUserId: userId },
        select: { id: true },
      });
      fromTeamId = t?.id ?? null;
      if (!fromTeamId) {
        return NextResponse.json({ error: "No team assigned to this coach yet" }, { status: 400 });
      }
    } else {
      
      const fromTeamIdFromBody = String(body?.fromTeamId ?? "");
      if (fromTeamIdFromBody) {
        fromTeamId = fromTeamIdFromBody;
      } else {
        const t = await prisma.draftTeam.findFirst({
          where: { draftEventId, coachUserId: userId },
          select: { id: true },
        });
        fromTeamId = t?.id ?? null;
      }
      if (!fromTeamId) {
        return NextResponse.json(
          { error: "Missing fromTeamId (ADMIN/BOARD) and no team could be inferred" },
          { status: 400 }
        );
      }
    }

    if (fromTeamId === toTeamId) {
      return NextResponse.json({ error: "Cannot trade with your own team" }, { status: 400 });
    }

 
    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId, id: { in: [fromTeamId, toTeamId] } },
      select: { id: true },
    });
    if (teams.length !== 2) {
      return NextResponse.json({ error: "One or both teams are invalid for this draft event" }, { status: 400 });
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
        { error: "One or more 'give' players are no longer on your roster" },
        { status: 400 }
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
        { error: "One or more 'receive' players are no longer on the partner roster" },
        { status: 400 }
      );
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

    const giveRounds = givePlayerIds
      .map((id) => roundByPlayer.get(id))
      .filter((v): v is number => typeof v === "number");

    const receiveRounds = receivePlayerIds
      .map((id) => roundByPlayer.get(id))
      .filter((v): v is number => typeof v === "number");

    const fromAvgRound = avg(giveRounds);
    const toAvgRound = avg(receiveRounds);
    const roundDelta =
      fromAvgRound != null && toAvgRound != null ? Math.abs(fromAvgRound - toAvgRound) : null;

    if (roundDelta == null || roundDelta > 2) {
      return NextResponse.json(
        { error: "Trade is not fair enough (avg rounds must be within 2)" },
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
        message: message ? message : null,
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
  } catch (err: any) {
    console.error("Trade propose error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to propose trade" },
      { status: 500 }
    );
  }
}
