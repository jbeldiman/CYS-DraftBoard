import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

type SaveOrderBody = { coachIds?: unknown };
type CreateCoachBody = { name?: unknown; email?: unknown; password?: unknown };

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users = await prisma.user.findMany({
      where: { role: "COACH" },
      orderBy: [{ coachOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, email: true, createdAt: true, coachOrder: true },
    });

    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load coaches" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const raw = (await req.json().catch(() => ({}))) as SaveOrderBody & CreateCoachBody;

    const coachIds: string[] = Array.isArray(raw?.coachIds) ? (raw.coachIds as unknown[]).map((v) => String(v)) : [];

    if (coachIds.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: coachIds }, role: "COACH" },
        select: { id: true },
      });

      if (found.length !== coachIds.length) {
        return NextResponse.json({ error: "One or more coachIds are invalid" }, { status: 400 });
      }

      await prisma.$transaction(
        coachIds.map((id: string, idx: number) =>
          prisma.user.update({
            where: { id },
            data: { coachOrder: idx + 1 },
          })
        )
      );

      return NextResponse.json({ ok: true, updated: coachIds.length });
    }

    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
    const password = typeof raw?.password === "string" ? raw.password : "";

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!password) return NextResponse.json({ error: "Temporary password is required" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Temporary password must be at least 8 characters" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "User with that email already exists" }, { status: 409 });

    const max = await prisma.user.aggregate({
      where: { role: "COACH" },
      _max: { coachOrder: true },
    });

    const nextOrder = (max._max.coachOrder ?? 0) + 1;

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name || null,
        email,
        passwordHash,
        role: "COACH",
        coachOrder: nextOrder,
      },
      select: { id: true, name: true, email: true, createdAt: true, coachOrder: true },
    });

    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to create coach" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await prisma.user.delete({ where: { id } });

    const remaining = await prisma.user.findMany({
      where: { role: "COACH" },
      orderBy: [{ coachOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    await prisma.$transaction(
      remaining.map((u: { id: string }, idx: number) =>
        prisma.user.update({
          where: { id: u.id },
          data: { coachOrder: idx + 1 },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to remove coach" }, { status: 500 });
  }
}
