import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const meId = (session?.user as any)?.id as string | undefined;
    const meEmail = (session?.user as any)?.email as string | undefined;
    const meRole = (session?.user as any)?.role as string | undefined;

    const event =
      (await prisma.draftEvent.findFirst({
        where: { phase: "LIVE" },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.draftEvent.findFirst({
        orderBy: { updatedAt: "desc" },
      }));

    if (!event) {
      return NextResponse.json({
        event: null,
        teams: [],
        recentPicks: [],
        counts: { undrafted: 0, drafted: 0 },
        me: meId || meEmail ? { id: meId ?? null, email: meEmail ?? null, role: meRole ?? null } : null,
        myTeam: null,
      });
    }

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId: event.id },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true },
    });

    const recentPicks = await prisma.draftPick.findMany({
      where: { draftEventId: event.id },
      orderBy: { overallNumber: "desc" },
      take: 12,
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

    const [undrafted, drafted] = await Promise.all([
      prisma.draftPlayer.count({
        where: { draftEventId: event.id, isDraftEligible: true, isDrafted: false },
      }),
      prisma.draftPlayer.count({
        where: { draftEventId: event.id, isDraftEligible: true, isDrafted: true },
      }),
    ]);

    let myTeam: { id: string; name: string; order: number } | null = null;

    if (meId || meEmail) {
      const candidates = [meId, meEmail].filter(Boolean) as string[];

      const t = await prisma.draftTeam.findFirst({
        where: {
          draftEventId: event.id,
          coachUserId: { in: candidates },
        },
        select: { id: true, name: true, order: true },
      });

      myTeam = t ?? null;
    }

    return NextResponse.json({
      event,
      teams,
      recentPicks: recentPicks.reverse(),
      counts: { undrafted, drafted },
      me: meId || meEmail ? { id: meId ?? null, email: meEmail ?? null, role: meRole ?? null } : null,
      myTeam,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load draft state" }, { status: 500 });
  }
}
