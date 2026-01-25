import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function currentEvent() {
  const e =
    (await prisma.draftEvent.findFirst({
      where: { phase: "LIVE" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })) ??
    (await prisma.draftEvent.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }));

  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

function boolParam(v: string | null) {
  if (v === null) return null;
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

function computeRating(p: { fall2025Rating: number | null; spring2025Rating: number | null; rank: number | null }) {
  const direct = p.fall2025Rating ?? p.spring2025Rating;
  if (direct != null) return Math.max(1, Math.min(5, Math.trunc(direct)));

  const r = p.rank;
  if (r == null) return null;

  if (r <= 10) return 5;
  if (r <= 20) return 4;
  if (r <= 30) return 3;
  if (r <= 40) return 2;
  return 1;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const eligible = boolParam(url.searchParams.get("eligible"));
    const drafted = boolParam(url.searchParams.get("drafted"));

    const draftEventId = await currentEvent();

    const where: any = { draftEventId };
    if (eligible !== null) where.isDraftEligible = eligible;
    if (drafted !== null) where.isDrafted = drafted;

    const players = await prisma.draftPlayer.findMany({
      where,
      orderBy: [{ rank: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        fullName: true,
        jerseySize: true,
        rank: true,
        fall2025Rating: true,
        spring2025Rating: true,
        isDraftEligible: true,
        isDrafted: true,
      },
    });


    const out = players.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      jerseySize: p.jerseySize,
      rank: p.rank,
      rating: computeRating({
        fall2025Rating: p.fall2025Rating,
        spring2025Rating: p.spring2025Rating,
        rank: p.rank,
      }),
      isDraftEligible: p.isDraftEligible,
      isDrafted: p.isDrafted,
    }));

    return NextResponse.json({ draftEventId, players: out });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ? String(err.message) : "Failed to load players" },
      { status: 500 }
    );
  }
}
