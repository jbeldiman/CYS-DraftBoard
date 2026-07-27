import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

type Division = "U11" | "U13";
type AccessLevel = "ADMIN" | "BOARD" | "U11_COACH" | "U13_COACH" | "PARENT";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function asAccessLevel(value: unknown): AccessLevel | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ["ADMIN", "BOARD", "U11_COACH", "U13_COACH", "PARENT"].includes(normalized)
    ? (normalized as AccessLevel)
    : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function resequenceDivision(tx: any, division: Division) {
  const coaches = await tx.user.findMany({
    where: { isDraftCoach: true, coachDivision: division },
    orderBy: [{ coachOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  await Promise.all(
    coaches.map((coach: { id: string }, index: number) =>
      tx.user.update({ where: { id: coach.id }, data: { coachOrder: index + 1 } })
    )
  );
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
    const requestedAccess = asAccessLevel(body?.accessLevel);

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (!requestedAccess) return NextResponse.json({ error: "Select a valid access level" }, { status: 400 });
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
      },
    });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (target.role === "ADMIN" && requestedAccess !== "ADMIN") {
      return NextResponse.json(
        { error: "The Admin account is protected. Its role cannot be changed here." },
        { status: 400 }
      );
    }
    if (target.role !== "ADMIN" && requestedAccess === "ADMIN") {
      return NextResponse.json({ error: "Additional Admin accounts cannot be assigned here." }, { status: 400 });
    }

    const duplicate = await prisma.user.findFirst({
      where: { email, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Another account already uses that email address" }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = { name, email };
      if (password) data.passwordHash = await bcrypt.hash(password, 10);

      if (target.role === "ADMIN") {
        data.role = "ADMIN";
      } else if (requestedAccess === "BOARD") {
        data.role = "BOARD";
        data.isDraftCoach = false;
        data.coachDivision = null;
        data.coachOrder = 0;
      } else if (requestedAccess === "PARENT") {
        data.role = "PARENT";
        data.isDraftCoach = false;
        data.coachDivision = null;
        data.coachOrder = 0;
      } else {
        const division: Division = requestedAccess === "U11_COACH" ? "U11" : "U13";
        const keepingOrder =
          target.isDraftCoach && target.coachDivision === division && target.coachOrder > 0;

        let coachOrder = target.coachOrder;
        if (!keepingOrder) {
          const result = await tx.user.aggregate({
            where: { isDraftCoach: true, coachDivision: division, id: { not: id } },
            _max: { coachOrder: true },
          });
          coachOrder = (result._max.coachOrder ?? 0) + 1;
        }

        data.role = "COACH";
        data.isDraftCoach = true;
        data.coachDivision = division;
        data.coachOrder = coachOrder;
      }

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
          createdAt: true,
          updatedAt: true,
        },
      });

      const newDivision = user.isDraftCoach ? (user.coachDivision as Division | null) : null;
      const oldDivision = target.isDraftCoach ? (target.coachDivision as Division | null) : null;
      if (oldDivision && oldDivision !== newDivision) await resequenceDivision(tx, oldDivision);

      return user;
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...updated,
        accessLevel:
          updated.role === "ADMIN"
            ? "ADMIN"
            : updated.role === "BOARD"
              ? "BOARD"
              : updated.isDraftCoach && updated.coachDivision === "U11"
                ? "U11_COACH"
                : updated.isDraftCoach && updated.coachDivision === "U13"
                  ? "U13_COACH"
                  : "PARENT",
      },
      passwordReset: !!password,
      message: `${updated.name ?? updated.email ?? "User"} was updated. They should sign out and back in to refresh access.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to update user" }, { status: 500 });
  }
}
