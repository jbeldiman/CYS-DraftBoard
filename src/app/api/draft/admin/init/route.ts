import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
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

  const existing = await prisma.draftEvent.findFirst({ orderBy: { createdAt: "desc" } });

  if (!existing) {
    const created = await prisma.draftEvent.create({
      data: {
        name: "CYS Draft Night",
        scheduledAt: new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
        phase: "SETUP",
        currentPick: 1,
        pickClockSeconds: 120,
        isPaused: true,
      },
      select: { id: true, name: true, scheduledAt: true },
    });

    return NextResponse.json({ event: created, created: true, reset: false });
  }

  if (!reset) {
    return NextResponse.json({
      event: { id: existing.id, name: existing.name, scheduledAt: existing.scheduledAt },
      created: false,
      reset: false,
    });
  }

  await prisma.$transaction([
    prisma.draftPick.deleteMany({ where: { draftEventId: existing.id } }),
    prisma.draftPlayer.deleteMany({ where: { draftEventId: existing.id } }),
    prisma.draftTeam.deleteMany({ where: { draftEventId: existing.id } }),
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