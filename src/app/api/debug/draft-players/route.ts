import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { getActiveDraftEvent } from "@/lib/activeDraftEvent";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const event = await getActiveDraftEvent();
  if (!event) return NextResponse.json({ error: "No active draft event" }, { status: 404 });

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

  return NextResponse.json({ draftEventId: event.id, count: players.length, players });
}
