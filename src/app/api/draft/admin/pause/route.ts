import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEvent() {
  const e = await prisma.draftEvent.findFirst({ orderBy: { createdAt: "desc" } });
  if (!e) throw new Error("No draft event found");
  return e;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const e = await latestEvent();
  const body = await req.json().catch(() => null);
  const paused = !!body?.paused;

  if (paused) {
    const now = Date.now();
    const remaining =
      e.clockEndsAt && !e.isPaused
        ? Math.max(0, Math.ceil((e.clockEndsAt.getTime() - now) / 1000))
        : e.pauseRemainingSecs ?? e.pickClockSeconds;

    const updated = await prisma.draftEvent.update({
      where: { id: e.id },
      data: {
        isPaused: true,
        clockEndsAt: null,
        pauseRemainingSecs: remaining,
      },
      select: { id: true, isPaused: true, clockEndsAt: true, pauseRemainingSecs: true },
    });

    return NextResponse.json({ event: updated });
  }

  const resumeSeconds = e.pauseRemainingSecs ?? e.pickClockSeconds;
  const clockEndsAt = new Date(Date.now() + Math.max(0, resumeSeconds) * 1000);

  const updated = await prisma.draftEvent.update({
    where: { id: e.id },
    data: {
      isPaused: false,
      pauseRemainingSecs: null,
      clockEndsAt,
    },
    select: { id: true, isPaused: true, clockEndsAt: true, pauseRemainingSecs: true },
  });

  return NextResponse.json({ event: updated });
}
