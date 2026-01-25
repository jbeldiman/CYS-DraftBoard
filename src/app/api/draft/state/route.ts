import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const event =
      (await prisma.draftEvent.findFirst({
        where: { phase: "LIVE" },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.draftEvent.findFirst({
        orderBy: { updatedAt: "desc" },
      }));

    if (!event) {
      return NextResponse.json({
        event: null,
        teams: [],
        recentPicks: [],
        counts: { undrafted: 0, drafted: 0 },
      });
    }

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId: event.id },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true },
    });

    const recentPicks = await prisma.draftPick.findMany({
      where: { draftEventId: event.id },
      orderBy: { overallNumber: "desc" },
      take: 12,
      select: {
        id: true,
        overallNumber: true,
        round: true,
        pickInRound: true,
        madeAt: true,
        team: { select: { id: true, name: true, order: true } },
        player: { select: { id: true, fullName: true, rank: true } },
      },
    });

    const [undrafted, drafted] = await Promise.all([
      prisma.draftPlayer.count({
        where: { draftEventId: event.id, isDraftEligible: true, isDrafted: false },
      }),
      prisma.draftPlayer.count({
        where: { draftEventId: event.id, isDraftEligible: true, isDrafted: true },
      }),
    ]);

    return NextResponse.json({
      event,
      teams,
      recentPicks: recentPicks.reverse(), 
      counts: { undrafted, drafted },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load draft state" }, { status: 500 });
  }
}
