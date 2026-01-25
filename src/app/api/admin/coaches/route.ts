import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

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

    const body = await req.json().catch(() => ({}));

    const coachIds = Array.isArray(body?.coachIds) ? body.coachIds.map(String) : null;

    if (coachIds && coachIds.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: coachIds }, role: "COACH" },
        select: { id: true },
      });

      if (found.length !== coachIds.length) {
        return NextResponse.json({ error: "One or more coachIds are invalid" }, { status: 400 });
      }

      await prisma.$transaction(
        coachIds.map((id, idx) =>
          prisma.user.update({
            where: { id },
            data: { coachOrder: idx + 1 },
          })
        )
      );

      return NextResponse.json({ ok: true, updated: coachIds.length });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!password) return NextResponse.json({ error: "Temporary password is required" }, { status: 400 });

    const max = await prisma.user.aggregate({
      where: { role: "COACH" },
      _max: { coachOrder: true },
    });

    const nextOrder = (max._max.coachOrder ?? 0) + 1;

    const passwordHash = password; 

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
      remaining.map((u, idx) =>
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
