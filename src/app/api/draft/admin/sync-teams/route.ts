import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function currentEventId() {
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

function safeTeamName(name: string | null, email: string | null, fallback: string) {
  const n = (name ?? "").trim();
  if (n) return n;
  const e = (email ?? "").trim();
  if (e) return e;
  return fallback;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const draftEventId = await currentEventId();

    const coaches = await prisma.user.findMany({
  where: { role: "COACH" },
  orderBy: [{ coachOrder: "asc" }, { createdAt: "asc" }],
  select: { id: true, name: true, email: true, createdAt: true, coachOrder: true },
});

    await prisma.$transaction(async (tx) => {
      await tx.draftTeam.deleteMany({ where: { draftEventId } });

      if (coaches.length) {
        await tx.draftTeam.createMany({
          data: coaches.map((c, idx) => ({
            draftEventId,
            order: idx + 1,
            name: safeTeamName(c.name, c.email, `Coach ${idx + 1}`),
            coachUserId: c.id,
          })),
        });
      }
    });

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, coachUserId: true },
    });

    return NextResponse.json({ ok: true, draftEventId, teams });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Failed to sync teams" }, { status: 500 });
  }
}
