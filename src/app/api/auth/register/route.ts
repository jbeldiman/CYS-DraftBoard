import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AccountType = "PARENT" | "COACH" | "BOARD";

function normEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function normStr(v: unknown) {
  return String(v ?? "").trim();
}

function normAccountType(v: unknown): AccountType {
  const raw = String(v ?? "")
    .trim()
    .toUpperCase();
  if (raw === "COACH" || raw === "BOARD" || raw === "PARENT") return raw;
  return "PARENT";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = normEmail(body?.email);
    const password = String(body?.password ?? "");
    const name = normStr(body?.name);
    const accountType = normAccountType(body?.accountType);

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "An account with that email already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email,
        name: name || null,
        role: "PARENT",
        passwordHash,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    let status: "CREATED" | "PENDING" = "CREATED";

    if (accountType === "COACH" || accountType === "BOARD") {
      status = "PENDING";
      await prisma.accessRequest.create({
        data: {
          userId: created.id,
          type: accountType,
          status: "PENDING",
        },
      });
    }

    return NextResponse.json({ ok: true, status, user: created }, { status: 201 });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Unknown error";

    if (msg.toLowerCase().includes("unique constraint") || msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ ok: false, error: "An account with that email already exists." }, { status: 409 });
    }

    return NextResponse.json({ ok: false, error: "Failed to create account." }, { status: 500 });
  }
}
