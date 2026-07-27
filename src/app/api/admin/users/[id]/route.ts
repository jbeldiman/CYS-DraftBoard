import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { coachesDivision, divisionCoachOrder, legacyCoachFields, type CoachDivision } from "@/lib/coachAccess";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function asBoolean(value: unknown) {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

async function nextOrder(tx: any, division: CoachDivision, excludedUserId: string) {
  if (division === "U11") {
    const result = await tx.user.aggregate({
      where: { coachesU11: true, id: { not: excludedUserId } },
      _max: { u11CoachOrder: true },
    });
    return (result._max.u11CoachOrder ?? 0) + 1;
  }
  const result = await tx.user.aggregate({
    where: { coachesU13: true, id: { not: excludedUserId } },
    _max: { u13CoachOrder: true },
  });
  return (result._max.u13CoachOrder ?? 0) + 1;
}

async function resequenceDivision(tx: any, division: CoachDivision) {
  const coaches = await tx.user.findMany({
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

  for (let index = 0; index < coaches.length; index += 1) {
    const coach = coaches[index];
    const nextU11Order = division === "U11" ? index + 1 : coach.u11CoachOrder;
    const nextU13Order = division === "U13" ? index + 1 : coach.u13CoachOrder;
    await tx.user.update({
      where: { id: coach.id },
      data: {
        ...(division === "U11" ? { u11CoachOrder: nextU11Order } : { u13CoachOrder: nextU13Order }),
        ...legacyCoachFields({
          coachesU11: coach.coachesU11,
          coachesU13: coach.coachesU13,
          u11CoachOrder: nextU11Order,
          u13CoachOrder: nextU13Order,
        }),
      },
    });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: routeId } = await context.params;
    const id = String(routeId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const requestedBoard = asBoolean(body?.isBoardMember);
    const requestedU11 = asBoolean(body?.coachesU11);
    const requestedU13 = asBoolean(body?.coachesU13);
    const requestedViewer = asBoolean(body?.isViewer);

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (password && password.length < 8) {
      return NextResponse.json({ error: "Temporary password must be at least 8 characters" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        email: true,
        isDraftCoach: true,
        coachDivision: true,
        coachOrder: true,
        coachesU11: true,
        coachesU13: true,
        u11CoachOrder: true,
        u13CoachOrder: true,
        isViewer: true,
      },
    });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const duplicate = await prisma.user.findFirst({
      where: { email, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Another account already uses that email address" }, { status: 409 });
    }

    const oldU11 = coachesDivision(target, "U11");
    const oldU13 = coachesDivision(target, "U13");

    const updated = await prisma.$transaction(async (tx) => {
      let u11CoachOrder = requestedU11 ? divisionCoachOrder(target, "U11") : 0;
      let u13CoachOrder = requestedU13 ? divisionCoachOrder(target, "U13") : 0;
      if (requestedU11 && u11CoachOrder <= 0) u11CoachOrder = await nextOrder(tx, "U11", id);
      if (requestedU13 && u13CoachOrder <= 0) u13CoachOrder = await nextOrder(tx, "U13", id);

      const role =
        target.role === "ADMIN"
          ? "ADMIN"
          : requestedBoard
            ? "BOARD"
            : requestedU11 || requestedU13
              ? "COACH"
              : "PARENT";

      const data: any = {
        name,
        email,
        role,
        coachesU11: requestedU11,
        coachesU13: requestedU13,
        u11CoachOrder,
        u13CoachOrder,
        isViewer: requestedViewer,
        ...legacyCoachFields({
          coachesU11: requestedU11,
          coachesU13: requestedU13,
          u11CoachOrder,
          u13CoachOrder,
        }),
      };
      if (password) data.passwordHash = await bcrypt.hash(password, 10);

      const user = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isDraftCoach: true,
          coachDivision: true,
          coachOrder: true,
          coachesU11: true,
          coachesU13: true,
          u11CoachOrder: true,
          u13CoachOrder: true,
          isViewer: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (oldU11 && !requestedU11) await resequenceDivision(tx, "U11");
      if (oldU13 && !requestedU13) await resequenceDivision(tx, "U13");
      return user;
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...updated,
        isAdminAccount: updated.role === "ADMIN",
        isBoardMember: updated.role === "BOARD",
        hasNoDraftAccess:
          updated.role !== "ADMIN" &&
          updated.role !== "BOARD" &&
          !updated.coachesU11 &&
          !updated.coachesU13 &&
          !updated.isViewer,
      },
      passwordReset: !!password,
      message: `${updated.name ?? updated.email ?? "User"} was updated. They should sign out and back in to refresh access.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to update user" }, { status: 500 });
  }
}
