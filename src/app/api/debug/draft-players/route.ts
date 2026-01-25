import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const event = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!event) {
    return NextResponse.json({ error: "No draft event" });
  }

  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId: event.id },
    select: {
      fullName: true,
      wantsU13: true,
      isDraftEligible: true,
      primaryEmail: true,
      primaryPhone: true,
      guardian1Name: true,
      guardian2Name: true,
    },
  });

  return NextResponse.json({
    draftEventId: event.id,
    count: players.length,
    players,
  });
}
