import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: any) {
  const teamId = context.params.teamID; // NOTE: must match folder name [teamID]

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = role === "COACH" || role === "ADMIN" || role === "BOARD";
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const team = await prisma.draftTeam.findUnique({
    where: { id: teamId },
    select: { draftEventId: true },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const trades = await prisma.trade.findMany({
    where: {
      draftEventId: team.draftEventId,
      OR: [{ fromTeamId: teamId }, { toTeamId: teamId }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      items: true,
      fromTeam: { select: { name: true } },
      toTeam: { select: { name: true } },
    },
  });

  return NextResponse.json({ trades });
}
