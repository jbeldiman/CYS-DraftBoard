import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
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

async function nextCoachOrder(division: Division) {
  if (division === "U11") {
    const result = await prisma.user.aggregate({
      where: { coachesU11: true },
      _max: { u11CoachOrder: true },
    });
    return (result._max.u11CoachOrder ?? 0) + 1;
  }
  const result = await prisma.user.aggregate({
    where: { coachesU13: true },
    _max: { u13CoachOrder: true },
  });
  return (result._max.u13CoachOrder ?? 0) + 1;
}

async function coachSummary() {
  const [u11, u13, total] = await Promise.all([
    prisma.user.count({ where: { coachesU11: true } }),
    prisma.user.count({ where: { coachesU13: true } }),
    prisma.user.count({ where: { OR: [{ coachesU11: true }, { coachesU13: true }] } }),
  ]);
  return { U11: u11, U13: u13, UNASSIGNED: 0, total };
}

const coachSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  isDraftCoach: true,
  coachDivision: true,
  coachOrder: true,
  coachesU11: true,
  coachesU13: true,
  u11CoachOrder: true,
  u13CoachOrder: true,
} as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users = await prisma.user.findMany({
      where: { OR: [{ coachesU11: true }, { coachesU13: true }] },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: coachSelect,
    });

    return NextResponse.json({ users, counts: await coachSummary() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load coaches" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").trim();
    const division = asDivision(body?.division);

    if (action === "includeCurrentAdmin") {
      if (!division) return NextResponse.json({ error: "U11 or U13 division is required" }, { status: 400 });

      const userId = String((session?.user as any)?.id ?? "").trim();
      if (!userId) return NextResponse.json({ error: "Missing Admin user id" }, { status: 401 });

      const name = String(body?.name ?? "").trim();
      const current = await prisma.user.findUnique({ where: { id: userId } });
      if (!current) return NextResponse.json({ error: "Admin account not found" }, { status: 404 });

      const coachesU11 = division === "U11" ? true : current.coachesU11;
      const coachesU13 = division === "U13" ? true : current.coachesU13;
      const u11CoachOrder =
        division === "U11" && (!current.coachesU11 || current.u11CoachOrder <= 0)
          ? await nextCoachOrder("U11")
          : current.u11CoachOrder;
      const u13CoachOrder =
        division === "U13" && (!current.coachesU13 || current.u13CoachOrder <= 0)
          ? await nextCoachOrder("U13")
          : current.u13CoachOrder;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          name: name || current.name,
          coachesU11,
          coachesU13,
          u11CoachOrder,
          u13CoachOrder,
          ...legacyCoachFields({ coachesU11, coachesU13, u11CoachOrder, u13CoachOrder }),
        },
        select: coachSelect,
      });

      return NextResponse.json({ ok: true, user, counts: await coachSummary() });
    }

    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!division) return NextResponse.json({ error: "Select U11 or U13" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Coach name is required" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!password) return NextResponse.json({ error: "Temporary password is required" }, { status: 400 });
    if (password.length < 8) {
      return NextResponse.json({ error: "Temporary password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists. Assign its U11/U13 access in Users & Seasonal Access." },
        { status: 409 }
      );
    }

    const order = await nextCoachOrder(division);
    const coachesU11 = division === "U11";
    const coachesU13 = division === "U13";
    const u11CoachOrder = coachesU11 ? order : 0;
    const u13CoachOrder = coachesU13 ? order : 0;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "COACH",
        coachesU11,
        coachesU13,
        u11CoachOrder,
        u13CoachOrder,
        ...legacyCoachFields({ coachesU11, coachesU13, u11CoachOrder, u13CoachOrder }),
      },
      select: coachSelect,
    });

    return NextResponse.json({ ok: true, user, counts: await coachSummary() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to create coach" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    if (searchParams.get("all") !== "true") {
      return NextResponse.json({ error: "Use the individual coach remove action or all=true" }, { status: 400 });
    }

    const coaches = await prisma.user.findMany({
      where: { OR: [{ coachesU11: true }, { coachesU13: true }] },
      select: { id: true, role: true },
    });

    await prisma.$transaction(
      coaches.map((coach) =>
        prisma.user.update({
          where: { id: coach.id },
          data: {
            coachesU11: false,
            coachesU13: false,
            u11CoachOrder: 0,
            u13CoachOrder: 0,
            isDraftCoach: false,
            coachDivision: null,
            coachOrder: 0,
            role: coach.role === "COACH" ? "PARENT" : coach.role,
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      cleared: coaches.length,
      message: "Coach rosters cleared. Accounts, Board access, and historical records were preserved.",
      counts: await coachSummary(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to clear coach roster" }, { status: 500 });
  }
}
