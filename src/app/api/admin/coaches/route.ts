import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

type Division = "U11" | "U13";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function asDivision(value: unknown): Division | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "U11" || normalized === "U13" ? normalized : null;
}

async function nextCoachOrder(division: Division) {
  const result = await prisma.user.aggregate({
    where: { isDraftCoach: true, coachDivision: division },
    _max: { coachOrder: true },
  });
  return (result._max.coachOrder ?? 0) + 1;
}

async function coachSummary() {
  const grouped = await prisma.user.groupBy({
    by: ["coachDivision"],
    where: { isDraftCoach: true },
    _count: { _all: true },
  });

  const counts = { U11: 0, U13: 0, UNASSIGNED: 0, total: 0 };
  for (const row of grouped) {
    const count = row._count._all;
    counts.total += count;
    if (row.coachDivision === "U11") counts.U11 += count;
    else if (row.coachDivision === "U13") counts.U13 += count;
    else counts.UNASSIGNED += count;
  }
  return counts;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users = await prisma.user.findMany({
      where: { isDraftCoach: true },
      orderBy: [{ coachDivision: "asc" }, { coachOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        coachOrder: true,
        coachDivision: true,
        isDraftCoach: true,
      },
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

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          name: name || current.name,
          isDraftCoach: true,
          coachDivision: division,
          coachOrder:
            current.isDraftCoach && current.coachDivision === division && current.coachOrder > 0
              ? current.coachOrder
              : await nextCoachOrder(division),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          coachOrder: true,
          coachDivision: true,
          isDraftCoach: true,
        },
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
        { error: "An account with that email already exists. Approve its request or use Add Me for the Admin account." },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "COACH",
        isDraftCoach: true,
        coachDivision: division,
        coachOrder: await nextCoachOrder(division),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        coachOrder: true,
        coachDivision: true,
        isDraftCoach: true,
      },
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
      where: { isDraftCoach: true },
      select: { id: true, role: true },
    });

    await prisma.$transaction(
      coaches.map((coach) =>
        prisma.user.update({
          where: { id: coach.id },
          data: {
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
      message: "Coach roster cleared. Accounts and historical records were preserved.",
      counts: await coachSummary(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to clear coach roster" }, { status: 500 });
  }
}
