import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!e?.id) {
    const created = await prisma.draftEvent.create({
      data: {
        name: "CYS Draft Night",
        scheduledAt: new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
        phase: "SETUP",
        currentPick: 1,
        pickClockSeconds: 120,
        isPaused: true,
      },
      select: { id: true },
    });
    return created.id;
  }
  return e.id;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = role === "COACH" || role === "ADMIN" || role === "BOARD";
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const draftEventId = await latestEventId();

  let myTeamId: string | null = null;
  if (role === "COACH") {
    const t = await prisma.draftTeam.findFirst({
      where: { draftEventId, coachUserId: userId },
      select: { id: true },
    });
    myTeamId = t?.id ?? null;
  }

  const where =
    role === "COACH" && myTeamId
      ? {
          draftEventId,
          OR: [{ fromTeamId: myTeamId }, { toTeamId: myTeamId }],
        }
      : { draftEventId };

  const trades = await prisma.trade.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      status: true,
      fromTeamId: true,
      toTeamId: true,
      fromAvgRound: true,
      toAvgRound: true,
      roundDelta: true,
      message: true,
      parentTradeId: true,
      createdAt: true,
      updatedAt: true,
      executedAt: true,
      fromTeam: { select: { id: true, name: true } },
      toTeam: { select: { id: true, name: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
      respondedByUser: { select: { id: true, name: true, email: true } },
      items: {
        select: {
          side: true,
          player: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  return NextResponse.json({
    myTeamId,
    trades,
  });
}
