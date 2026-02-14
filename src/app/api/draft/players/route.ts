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

function toRating(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1) return 1;
  if (t > 5) return 5;
  return t;
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
        spring2026Rating: true,

        notes: true,
        isDraftEligible: true,
        isDrafted: true,
        draftedAt: true,
        draftedTeamId: true,
        draftedTeam: { select: { id: true, name: true, order: true } },

        isGoalie: true,
      },
    });

    const players = rows.map((p) => {
      const spring2026Rating = toRating(p.spring2026Rating);

      return {
        ...p,
        spring2026Rating,
        rating: spring2026Rating,
        isGoalie: !!p.isGoalie,
      };
    });

    return NextResponse.json({ draftEventId, players });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to load players" },
      { status: 500 }
    );
  }
}
