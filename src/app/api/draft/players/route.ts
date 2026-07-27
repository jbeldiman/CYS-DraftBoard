import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { requireActiveDraftEventId } from "@/lib/activeDraftEvent";

export const runtime = "nodejs";

async function resolveEventId() {
  return requireActiveDraftEventId();
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
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        firstName: true,
        lastName: true,
        fullName: true,
        gender: true,
        dob: true,
        birthYear: true,
        leagueChoice: true,
        wantsU13: true,
        jerseySize: true,
        experience: true,
        rank: true,
        rating: true,

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
        evalAttended: true,
        evalNumber: true,
      },
    });

    const players = rows.map((p) => {
      const currentRating = toRating(p.rating ?? p.spring2026Rating);
      return {
        ...p,
        spring2026Rating: currentRating,
        rating: currentRating,
        isGoalie: !!p.isGoalie,
        evalAttended: !!p.evalAttended,
        evalNumber: p.evalNumber ?? null,
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
