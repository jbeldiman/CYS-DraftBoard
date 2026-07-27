import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getActiveDraftEventId } from "@/lib/activeDraftEvent";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["COACH", "ADMIN", "BOARD"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const draftEventId = await getActiveDraftEventId();
    if (!draftEventId) return NextResponse.json({ trades: [], myTeamId: null });

    const myTeam = await prisma.draftTeam.findFirst({
      where: { draftEventId, coachUserId: userId },
      select: { id: true },
    });
    const myTeamId = myTeam?.id ?? null;

    if (role === "COACH" && !myTeamId) {
      return NextResponse.json({ trades: [], myTeamId: null });
    }

    // Coaches and Board members who coach see their own team's trade activity.
    // A non-coaching Admin/Board account may still review all active-event trades.
    const where =
      myTeamId && role !== "ADMIN"
        ? {
            draftEventId,
            OR: [{ fromTeamId: myTeamId }, { toTeamId: myTeamId }],
          }
        : { draftEventId };

    const trades = await prisma.trade.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        fromTeamId: true,
        toTeamId: true,
        fromAvgRound: true,
        toAvgRound: true,
        roundDelta: true,
        message: true,
        parentTradeId: true,
        createdAt: true,
        updatedAt: true,
        executedAt: true,
        fromTeam: { select: { id: true, name: true } },
        toTeam: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        respondedByUser: { select: { id: true, name: true, email: true } },
        items: {
          select: {
            side: true,
            player: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    return NextResponse.json({ myTeamId, trades });
  } catch (error) {
    console.error("Trade inbox error:", error);
    return NextResponse.json({ error: "Failed to load trades" }, { status: 500 });
  }
}
