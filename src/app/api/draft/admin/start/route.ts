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
  const body = await req.json().catch(() => ({}));
  const pickClockSeconds = body?.pickClockSeconds === undefined ? null : Number(body.pickClockSeconds);

  const seconds =
    Number.isFinite(pickClockSeconds) && pickClockSeconds! > 0 ? Math.floor(pickClockSeconds!) : e.pickClockSeconds;
  const now = new Date();
  const clockEndsAt = new Date(now.getTime() + seconds * 1000);

  const updated = await prisma.draftEvent.update({
    where: { id: e.id },
    data: {
      phase: "LIVE",
      pickClockSeconds: seconds,
      isPaused: false,
      pauseRemainingSecs: null,
      clockEndsAt,
    },
    select: {
      id: true,
      phase: true,
      currentPick: true,
      pickClockSeconds: true,
      isPaused: true,
      clockEndsAt: true,
    },
  });

  return NextResponse.json({ event: updated });
}
