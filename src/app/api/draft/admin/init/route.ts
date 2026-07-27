import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getActiveDraftEvent, getOrCreateActiveDraftEvent } from "@/lib/activeDraftEvent";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reset = !!body?.reset;

  const existing = await getActiveDraftEvent();

  if (!existing) {
    const created = await getOrCreateActiveDraftEvent();
    return NextResponse.json({
      event: { id: created.id, name: created.name, scheduledAt: created.scheduledAt },
      created: true,
      reset: false,
    });
  }

  if (!reset) {
    return NextResponse.json({
      event: { id: existing.id, name: existing.name, scheduledAt: existing.scheduledAt },
      created: false,
      reset: false,
    });
  }

  if (existing.phase === "ARCHIVED") {
    return NextResponse.json({ error: "Archived drafts cannot be restarted." }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.trade.deleteMany({ where: { draftEventId: existing.id } }),
    prisma.draftPick.deleteMany({ where: { draftEventId: existing.id } }),
    prisma.draftPlayer.updateMany({
      where: { draftEventId: existing.id },
      data: { isDrafted: false, draftedTeamId: null, draftedAt: null },
    }),
    prisma.draftEvent.update({
      where: { id: existing.id },
      data: {
        phase: "SETUP",
        currentPick: 1,
        isPaused: true,
        clockEndsAt: null,
        pauseRemainingSecs: null,
      },
    }),
  ]);

  const updated = await prisma.draftEvent.findUnique({
    where: { id: existing.id },
    select: { id: true, name: true, scheduledAt: true, phase: true, currentPick: true },
  });

  return NextResponse.json({ event: updated, created: false, reset: true });
}
