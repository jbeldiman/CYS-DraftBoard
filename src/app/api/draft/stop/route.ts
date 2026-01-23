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

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const e = await latestEvent();

  const updated = await prisma.draftEvent.update({
    where: { id: e.id },
    data: {
      phase: "SETUP",
      isPaused: true,
      clockEndsAt: null,
      pauseRemainingSecs: null,
    },
    select: {
      id: true,
      phase: true,
      currentPick: true,
      pickClockSeconds: true,
      isPaused: true,
      clockEndsAt: true,
      pauseRemainingSecs: true,
    },
  });

  return NextResponse.json({ event: updated });
}