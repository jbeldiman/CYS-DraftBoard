import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function isBoard(session: any) {
  return session?.user && (session.user as any).role === "BOARD";
}

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session) && !isBoard(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const draftEventId = await latestEventId();
    const body = await req.json().catch(() => null);
    const players = Array.isArray(body?.players) ? body.players : [];

    const clean = players
      .map((p: any) => ({
        id: (p?.id ?? "").toString().trim(),
        rank: p?.rank === null || p?.rank === undefined || p?.rank === "" ? null : Number(p.rank),
        notes: p?.notes === null || p?.notes === undefined ? null : String(p.notes),
        fall2025Rating:
          p?.fall2025Rating === null || p?.fall2025Rating === undefined || p?.fall2025Rating === ""
            ? null
            : Number(p.fall2025Rating),
        spring2025Rating:
          p?.spring2025Rating === null || p?.spring2025Rating === undefined || p?.spring2025Rating === ""
            ? null
            : Number(p.spring2025Rating),
      }))
      .filter((p: any) => p.id);

    if (clean.length === 0) {
      return NextResponse.json({ error: "No valid players provided" }, { status: 400 });
    }

    const ops = clean.map((p: any) =>
      prisma.draftPlayer.update({
        where: { id: p.id },
        data: {
          ...(Number.isFinite(p.rank) ? { rank: p.rank } : { rank: null }),
          notes: p.notes,
          ...(Number.isFinite(p.fall2025Rating) ? { fall2025Rating: p.fall2025Rating } : { fall2025Rating: null }),
          ...(Number.isFinite(p.spring2025Rating) ? { spring2025Rating: p.spring2025Rating } : { spring2025Rating: null }),
        },
      })
    );

    await prisma.$transaction(ops);

    const out = await prisma.draftPlayer.findMany({
      where: { draftEventId },
      orderBy: [{ isDrafted: "asc" }, { rank: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        experience: true,
        rank: true,
        fall2025Rating: true,
        spring2025Rating: true,
        notes: true,
        isDraftEligible: true,
        isDrafted: true,
        draftedAt: true,
        draftedTeam: { select: { name: true, order: true } },
      },
    });

    return NextResponse.json({ draftEventId, players: out });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ? String(err.message) : "Failed to update players" }, { status: 500 });
  }
}
