import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { legacyCoachFields, type CoachDivision } from "@/lib/coachAccess";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function asDivision(value: unknown): CoachDivision | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "U11" || normalized === "U13" ? normalized : null;
}

async function resequenceDivision(division: CoachDivision) {
  const remaining = await prisma.user.findMany({
    where: division === "U11" ? { coachesU11: true } : { coachesU13: true },
    orderBy:
      division === "U11"
        ? [{ u11CoachOrder: "asc" }, { createdAt: "asc" }]
        : [{ u13CoachOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      coachesU11: true,
      coachesU13: true,
      u11CoachOrder: true,
      u13CoachOrder: true,
    },
  });

  await prisma.$transaction(
    remaining.map((user, index) => {
      const u11CoachOrder = division === "U11" ? index + 1 : user.u11CoachOrder;
      const u13CoachOrder = division === "U13" ? index + 1 : user.u13CoachOrder;
      return prisma.user.update({
        where: { id: user.id },
        data: {
          ...(division === "U11" ? { u11CoachOrder } : { u13CoachOrder }),
          ...legacyCoachFields({
            coachesU11: user.coachesU11,
            coachesU13: user.coachesU13,
            u11CoachOrder,
            u13CoachOrder,
          }),
        },
      });
    })
  );
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: routeId } = await context.params;
    const id = String(routeId ?? "").trim();
    const division = asDivision(new URL(req.url).searchParams.get("division"));
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (!division) return NextResponse.json({ error: "division must be U11 or U13" }, { status: 400 });

    const coach = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        coachesU11: true,
        coachesU13: true,
        u11CoachOrder: true,
        u13CoachOrder: true,
      },
    });
    if (!coach || (division === "U11" ? !coach.coachesU11 : !coach.coachesU13)) {
      return NextResponse.json({ error: `${division} coach assignment not found` }, { status: 404 });
    }

    const coachesU11 = division === "U11" ? false : coach.coachesU11;
    const coachesU13 = division === "U13" ? false : coach.coachesU13;
    const u11CoachOrder = division === "U11" ? 0 : coach.u11CoachOrder;
    const u13CoachOrder = division === "U13" ? 0 : coach.u13CoachOrder;

    await prisma.user.update({
      where: { id },
      data: {
        coachesU11,
        coachesU13,
        u11CoachOrder,
        u13CoachOrder,
        role: coach.role === "COACH" && !coachesU11 && !coachesU13 ? "PARENT" : coach.role,
        ...legacyCoachFields({ coachesU11, coachesU13, u11CoachOrder, u13CoachOrder }),
      },
    });

    await resequenceDivision(division);
    return NextResponse.json({ ok: true, preservedHistory: true, removedDivision: division });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to remove coach" }, { status: 500 });
  }
}
