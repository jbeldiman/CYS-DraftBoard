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

    if (!event) return NextResponse.json({ picks: [] });

    const picks = await prisma.draftPick.findMany({
      where: { draftEventId: event.id },
      orderBy: [{ overallNumber: "asc" }, { madeAt: "asc" }],
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

    return NextResponse.json({ picks });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load picks" }, { status: 500 });
  }
}
