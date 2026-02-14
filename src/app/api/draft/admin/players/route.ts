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

function clampRating(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1) return 1;
  if (t > 5) return 5;
  return t;
}

function clampBool(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return undefined;
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
        spring2026Rating: true,
        isDraftEligible: true,
        isDrafted: true,
        isGoalie: true,
      },
    });

    const out = players.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      jerseySize: p.jerseySize,
      rank: p.rank,
      spring2026Rating: p.spring2026Rating ?? null,
      rating: p.spring2026Rating ?? null,
      isDraftEligible: p.isDraftEligible,
      isDrafted: p.isDrafted,
      isGoalie: !!p.isGoalie,
    }));

    return NextResponse.json({ draftEventId, players: out });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ? String(err.message) : "Failed to load players" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const players = Array.isArray(body?.players) ? body.players : [];
    if (!players.length) {
      return NextResponse.json(
        { error: "No players provided" },
        { status: 400 }
      );
    }

    const draftEventId = await currentEvent();

    await prisma.$transaction(
      players.map((p: any) => {
        const id = String(p?.id ?? "");
        if (!id) throw new Error("Missing player id");

        const spring2026Rating = clampRating(p?.spring2026Rating);
        const isGoalie = clampBool(p?.isGoalie);

        return prisma.draftPlayer.updateMany({
          where: { id, draftEventId },
          data: {
            spring2026Rating,
            notes: p?.notes ?? null,
            experience: p?.experience ?? null,
            ...(typeof isGoalie === "boolean" ? { isGoalie } : {}),
          },
        });
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ? String(err.message) : "Save failed" },
      { status: 500 }
    );
  }
}
