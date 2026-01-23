import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

function splitName(fullName: string) {
  const raw = String(fullName ?? "").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { firstName, lastName };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const drafted = url.searchParams.get("drafted");
  const onlyUndrafted = drafted === "false";
  const onlyDrafted = drafted === "true";

  const draftEventId = await latestEventId();

  const players = await prisma.draftPlayer.findMany({
    where: {
      draftEventId,
      ...(onlyUndrafted ? { isDrafted: false } : {}),
      ...(onlyDrafted ? { isDrafted: true } : {}),
    },
    orderBy: [{ isDrafted: "asc" }, { rank: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      rank: true,
      notes: true,
      isDrafted: true,
      draftedAt: true,
      draftedTeam: { select: { id: true, name: true, order: true } },
    },
  });

  return NextResponse.json({ draftEventId, players });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const draftEventId = await latestEventId();
  const body = await req.json().catch(() => null);

  const players = Array.isArray(body?.players) ? body.players : [];
  const clean = players
    .map((p: any) => {
      const fullName = (p?.fullName ?? "").toString().trim();
      const { firstName, lastName } = splitName(fullName);
      return {
        id: (p?.id ?? "").toString().trim() || null,
        fullName,
        firstName,
        lastName,
        rank: p?.rank === null || p?.rank === undefined || p?.rank === "" ? null : Number(p.rank),
        notes: (p?.notes ?? "").toString().trim() || null,
      };
    })
    .filter((p: any) => p.fullName);

  const ops = clean.map((p: any) => {
    const baseData = {
      fullName: p.fullName,
      firstName: p.firstName,
      lastName: p.lastName,
      rank: Number.isFinite(p.rank) ? p.rank : null,
      notes: p.notes,
    };

    if (p.id) {
      return prisma.draftPlayer.update({
        where: { id: p.id },
        data: baseData,
      });
    }

    return prisma.draftPlayer.create({
      data: { draftEventId, ...baseData },
    });
  });

  await prisma.$transaction(ops);

  const out = await prisma.draftPlayer.findMany({
    where: { draftEventId },
    orderBy: [{ isDrafted: "asc" }, { rank: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      rank: true,
      notes: true,
      isDrafted: true,
      draftedAt: true,
      draftedTeam: { select: { id: true, name: true, order: true } },
    },
  });

  return NextResponse.json({ draftEventId, players: out });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = (body?.id ?? "").toString().trim();
  if (!id) return NextResponse.json({ error: "Player id required" }, { status: 400 });

  await prisma.draftPlayer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
