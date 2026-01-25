import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toStringOrNull(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s;
}

function normalizeIncomingPlayers(body: any): any[] {
  if (Array.isArray(body?.players)) return body.players;
  if (body?.player && typeof body.player === "object") return [body.player];
  if (body && typeof body === "object" && body.id) return [body];
  return [];
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const draftEventId = await latestEventId();
    const body = await req.json().catch(() => null);

    const incoming = normalizeIncomingPlayers(body);

    const clean = incoming
      .map((p: any) => {
        const id = (p?.id ?? "").toString().trim();
        if (!id) return null;

        const rank = toIntOrNull(p?.rank);
        const fall2025Rating = toIntOrNull(p?.fall2025Rating);
        const spring2025Rating = toIntOrNull(p?.spring2025Rating);
        const notes = toStringOrNull(p?.notes);

        return { id, rank, fall2025Rating, spring2025Rating, notes };
      })
      .filter(Boolean) as {
      id: string;
      rank: number | null;
      fall2025Rating: number | null;
      spring2025Rating: number | null;
      notes: string | null;
    }[];

    if (clean.length === 0) {
      return NextResponse.json({ error: "No valid players provided" }, { status: 400 });
    }

    await prisma.$transaction(
      clean.map((p) =>
        prisma.draftPlayer.updateMany({
          where: { id: p.id, draftEventId },
          data: {
            rank: p.rank,
            fall2025Rating: p.fall2025Rating,
            spring2025Rating: p.spring2025Rating,
            notes: p.notes,
          },
        })
      )
    );

    const ids = clean.map((p) => p.id);

    const updated = await prisma.draftPlayer.findMany({
      where: { draftEventId, id: { in: ids } },
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
        draftedTeam: { select: { name: true, order: true } },
      },
    });

    return NextResponse.json({ draftEventId, players: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ? String(err.message) : "Failed to update players" },
      { status: 500 }
    );
  }
}
