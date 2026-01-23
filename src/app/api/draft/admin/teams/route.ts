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

export async function GET() {
  const draftEventId = await latestEventId();
  const teams = await prisma.draftTeam.findMany({
    where: { draftEventId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
      coachUserId: true,
      coachUser: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ draftEventId, teams });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const draftEventId = await latestEventId();
  const body = await req.json().catch(() => null);

  const teams = Array.isArray(body?.teams) ? body.teams : [];
  const clean = teams
    .map((t: any) => ({
      id: (t?.id ?? "").toString().trim() || null,
      name: (t?.name ?? "").toString().trim(),
      order: Number(t?.order),
      coachUserId: (t?.coachUserId ?? "").toString().trim() || null,
    }))
    .filter((t: any) => t.name && Number.isFinite(t.order) && t.order > 0);

  const upserts = clean.map((t: any) => {
    if (t.id) {
      return prisma.draftTeam.update({
        where: { id: t.id },
        data: { name: t.name, order: t.order, coachUserId: t.coachUserId },
      });
    }
    return prisma.draftTeam.create({
      data: { draftEventId, name: t.name, order: t.order, coachUserId: t.coachUserId },
    });
  });

  await prisma.$transaction(upserts);

  const out = await prisma.draftTeam.findMany({
    where: { draftEventId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
      coachUserId: true,
      coachUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ draftEventId, teams: out });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const id = (body?.id ?? "").toString().trim();
  if (!id) return NextResponse.json({ error: "Team id required" }, { status: 400 });

  await prisma.draftTeam.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
