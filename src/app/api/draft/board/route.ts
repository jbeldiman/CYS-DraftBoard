import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdminOrBoard(session: any) {
  const role = (session?.user as any)?.role;
  return role === "ADMIN" || role === "BOARD";
}

function normalizeEntries(input: any): Array<{ playerId: string; addedAt: number; slot?: number }> {
  const arr = Array.isArray(input) ? input : [];
  const out: Array<{ playerId: string; addedAt: number; slot?: number }> = [];

  for (const e of arr) {
    const playerId = typeof e?.playerId === "string" ? e.playerId.trim() : "";
    if (!playerId) continue;

    const addedAtNum = typeof e?.addedAt === "number" ? e.addedAt : Number(e?.addedAt);
    const addedAt = Number.isFinite(addedAtNum) ? addedAtNum : Date.now();

    const slotNum = typeof e?.slot === "number" ? e.slot : Number(e?.slot);
    const slot = Number.isFinite(slotNum) && slotNum > 0 ? slotNum : undefined;

    out.push({ playerId, addedAt, slot });
  }


  return out.slice(0, 500);
}

async function getActiveEventId() {
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

  return event?.id ?? null;
}

async function resolveTeamId(req: Request, session: any, draftEventId: string) {
  const { searchParams } = new URL(req.url);
  const teamIdParam = searchParams.get("teamId");
  const admin = isAdminOrBoard(session);

  const meId = (session?.user as any)?.id as string | undefined;
  const meEmail = (session?.user as any)?.email as string | undefined;

  if (teamIdParam) {
    if (!admin) {
      
      return null;
    }

    const team = await prisma.draftTeam.findFirst({
      where: { id: teamIdParam, draftEventId },
      select: { id: true },
    });

    return team?.id ?? null;
  }

  if (!meId && !meEmail) return null;

  const candidates = [meId, meEmail].filter(Boolean) as string[];

  const team = await prisma.draftTeam.findFirst({
    where: { draftEventId, coachUserId: { in: candidates } },
    select: { id: true },
  });

  return team?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    const draftEventId = await getActiveEventId();
    if (!draftEventId) return NextResponse.json({ entries: [] });

    const teamId = await resolveTeamId(req, session, draftEventId);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 404 });

    const board = await prisma.draftBoard.findUnique({
      where: { draftEventId_teamId: { draftEventId, teamId } },
      select: { entries: true },
    });

    const entries = normalizeEntries((board?.entries as any)?.entries ?? board?.entries ?? []);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load board" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    const draftEventId = await getActiveEventId();
    if (!draftEventId) return NextResponse.json({ error: "No draft event" }, { status: 404 });

    const teamId = await resolveTeamId(req, session, draftEventId);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as any;
    const entries = normalizeEntries(body?.entries);

    const ids = [...new Set(entries.map((e) => e.playerId))];
    if (ids.length) {
      const valid = await prisma.draftPlayer.findMany({
        where: { draftEventId, id: { in: ids } },
        select: { id: true },
      });
      const validSet = new Set(valid.map((p) => p.id));
      const filtered = entries.filter((e) => validSet.has(e.playerId));

      await prisma.draftBoard.upsert({
        where: { draftEventId_teamId: { draftEventId, teamId } },
        create: {
          draftEventId,
          teamId,
          entries: filtered,
        },
        update: {
          entries: filtered,
        },
      });

      return NextResponse.json({ ok: true, entries: filtered });
    }

    await prisma.draftBoard.upsert({
      where: { draftEventId_teamId: { draftEventId, teamId } },
      create: {
        draftEventId,
        teamId,
        entries: [],
      },
      update: {
        entries: [],
      },
    });

    return NextResponse.json({ ok: true, entries: [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save board" }, { status: 500 });
  }
}
