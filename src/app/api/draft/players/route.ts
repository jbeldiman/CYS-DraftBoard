import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function resolveEventId() {
  const event =
    (await prisma.draftEvent.findFirst({
      where: { phase: "LIVE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })) ??
    (await prisma.draftEvent.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }));

  if (!event?.id) throw new Error("No draft event found");
  return event.id;
}

function deriveRatingFromRank(rank: number | null | undefined): number | null {
  if (rank == null) return null;
  if (rank <= 10) return 5;
  if (rank <= 20) return 4;
  if (rank <= 30) return 3;
  if (rank <= 40) return 2;
  return 1;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const eligible = url.searchParams.get("eligible");
    const drafted = url.searchParams.get("drafted");
    const teamId = url.searchParams.get("teamId");
    const q = url.searchParams.get("q")?.trim() ?? "";

    const draftEventId = await resolveEventId();

    const where: any = { draftEventId };

    if (eligible === "true") where.isDraftEligible = true;
    if (eligible === "false") where.isDraftEligible = false;

    if (drafted === "true") where.isDrafted = true;
    if (drafted === "false") where.isDrafted = false;

    if (teamId) where.draftedTeamId = String(teamId);

    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.draftPlayer.findMany({
      where,
      orderBy: [{ isDrafted: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        registrationId: true,
        firstName: true,
        lastName: true,
        fullName: true,
        gender: true,
        dob: true,
        birthYear: true,
        leagueChoice: true,
        wantsU13: true,
        jerseySize: true,
        guardian1Name: true,
        guardian2Name: true,
        primaryPhone: true,
        primaryEmail: true,
        experience: true,
        rank: true,
        spring2025Rating: true,
        fall2025Rating: true,
        notes: true,
        isDraftEligible: true,
        isDrafted: true,
        draftedAt: true,
        draftedTeamId: true,
        draftedTeam: { select: { id: true, name: true, order: true } },
      },
    });

    const players = rows.map((p) => {
      const raw =
        typeof p.fall2025Rating === "number"
          ? p.fall2025Rating
          : typeof p.spring2025Rating === "number"
            ? p.spring2025Rating
            : null;

      const rating = raw ?? deriveRatingFromRank(p.rank);

      return {
        ...p,
        rating,
      };
    });

    return NextResponse.json({ draftEventId, players });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load players" }, { status: 500 });
  }
}
