import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireActiveDraftEvent } from "@/lib/activeDraftEvent";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function safeTeamName(name: string | null, email: string | null, fallback: string) {
  const normalizedName = (name ?? "").trim();
  if (normalizedName) return normalizedName;
  const normalizedEmail = (email ?? "").trim();
  if (normalizedEmail) return normalizedEmail;
  return fallback;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const event = await requireActiveDraftEvent();
    if (!event.division) {
      return NextResponse.json({ error: "The active draft must be assigned to U11 or U13 before syncing teams." }, { status: 409 });
    }

    const draftEventId = event.id;
    const existingPicks = await prisma.draftPick.count({ where: { draftEventId } });
    if (event.phase !== "SETUP" || existingPicks > 0) {
      return NextResponse.json(
        { error: "Teams can only be synchronized while the active draft is in SETUP with no picks." },
        { status: 409 }
      );
    }

    const coaches = await prisma.user.findMany({
      where: event.division === "U11" ? { coachesU11: true } : { coachesU13: true },
      orderBy:
        event.division === "U11"
          ? [{ u11CoachOrder: "asc" }, { createdAt: "asc" }]
          : [{ u13CoachOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.draftTeam.deleteMany({ where: { draftEventId } });

      if (coaches.length) {
        await tx.draftTeam.createMany({
          data: coaches.map((coach, index) => ({
            draftEventId,
            order: index + 1,
            name: safeTeamName(coach.name, coach.email, `Coach ${index + 1}`),
            coachUserId: coach.id,
          })),
        });
      }
    });

    const teams = await prisma.draftTeam.findMany({
      where: { draftEventId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, coachUserId: true },
    });

    return NextResponse.json({ ok: true, draftEventId, division: event.division, teams });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message ?? "Failed to sync teams" }, { status: 500 });
  }
}
