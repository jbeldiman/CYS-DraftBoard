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
  if (!e?.id) {
    const created = await prisma.draftEvent.create({
      data: {
        name: "CYS Draft Night",
        scheduledAt: new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
        phase: "SETUP",
        currentPick: 1,
        pickClockSeconds: 120,
        isPaused: true,
      },
      select: { id: true },
    });
    return created.id;
  }
  return e.id;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const draftEventId = await latestEventId();

  const teams = await prisma.draftTeam.findMany({
    where: { draftEventId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
      coachUser: { select: { id: true, name: true, email: true } },
    },
  });

  const players = await prisma.draftPlayer.findMany({
    where: { draftEventId, isDrafted: true },
    orderBy: [{ draftedAt: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      draftedTeamId: true,
      firstName: true,
      lastName: true,
      fullName: true,
      dob: true,
      gender: true,
      jerseySize: true,
      guardian1Name: true,
      guardian2Name: true,
      primaryPhone: true,
      primaryEmail: true,
    },
  });

  const byTeam: Record<string, any[]> = {};
  for (const p of players) {
    const k = p.draftedTeamId ?? "unassigned";
    if (!byTeam[k]) byTeam[k] = [];
    byTeam[k].push(p);
  }

  return NextResponse.json({
    draftEventId,
    teams: teams.map((t) => ({
      ...t,
      players: byTeam[t.id] ?? [],
    })),
  });
}