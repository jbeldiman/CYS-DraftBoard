import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const draftEventId = url.searchParams.get("draftEventId") ?? "";

  const event = draftEventId
    ? await prisma.draftEvent.findUnique({ where: { id: draftEventId }, select: { id: true } })
    : await prisma.draftEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });

  if (!event?.id) return NextResponse.json({ picks: [] });

  const picks = await prisma.draftPick.findMany({
    where: { draftEventId: event.id },
    orderBy: { overallNumber: "asc" },
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

  return NextResponse.json({ draftEventId: event.id, picks });
}