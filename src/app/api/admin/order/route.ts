import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { legacyCoachFields, type CoachDivision } from "@/lib/coachAccess";

export const runtime = "nodejs";

type Division = CoachDivision;

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function asDivision(value: unknown): Division | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "U11" || normalized === "U13" ? normalized : null;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const division = asDivision(body?.division);
    const coachIds = Array.isArray(body?.coachIds) ? body.coachIds.map((value: unknown) => String(value)) : [];

    if (!division) return NextResponse.json({ error: "division must be U11 or U13" }, { status: 400 });
    if (coachIds.length === 0) return NextResponse.json({ error: "coachIds[] is required" }, { status: 400 });
    if (new Set(coachIds).size !== coachIds.length) {
      return NextResponse.json({ error: "coachIds must be unique" }, { status: 400 });
    }

    const divisionCoaches = await prisma.user.findMany({
      where: division === "U11" ? { coachesU11: true } : { coachesU13: true },
      select: {
        id: true,
        coachesU11: true,
        coachesU13: true,
        u11CoachOrder: true,
        u13CoachOrder: true,
      },
    });
    const expected = new Set(divisionCoaches.map((coach) => coach.id));

    if (expected.size !== coachIds.length || coachIds.some((id: string) => !expected.has(id))) {
      return NextResponse.json(
        { error: `The order must include every ${division} coach exactly once.` },
        { status: 400 }
      );
    }

    const byId = new Map(divisionCoaches.map((coach) => [coach.id, coach]));
    await prisma.$transaction(
      coachIds.map((id: string, index: number) => {
        const coach = byId.get(id)!;
        const u11CoachOrder = division === "U11" ? index + 1 : coach.u11CoachOrder;
        const u13CoachOrder = division === "U13" ? index + 1 : coach.u13CoachOrder;
        return prisma.user.update({
          where: { id },
          data: {
            ...(division === "U11" ? { u11CoachOrder } : { u13CoachOrder }),
            ...legacyCoachFields({
              coachesU11: coach.coachesU11,
              coachesU13: coach.coachesU13,
              u11CoachOrder,
              u13CoachOrder,
            }),
          },
        });
      })
    );

    return NextResponse.json({ ok: true, division, updated: coachIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to save coach order" }, { status: 500 });
  }
}
