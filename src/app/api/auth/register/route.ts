import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AccountType = "U11_COACH" | "U13_COACH" | "BOARD";

function normEmail(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function normString(value: unknown) {
  return String(value ?? "").trim();
}

function normAccountType(value: unknown): AccountType | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "U11_COACH" || raw === "U13_COACH" || raw === "BOARD") return raw;
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normEmail(body?.email);
    const password = String(body?.password ?? "");
    const name = normString(body?.name);
    const accountType = normAccountType(body?.accountType);

    if (!name || !email || !password || !accountType) {
      return NextResponse.json(
        { ok: false, error: "Name, account type, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ ok: false, error: "An account with that email already exists." }, { status: 409 });
    }

    const created = await prisma.user.create({
      data: {
        email,
        name,
        role: "PARENT",
        passwordHash: await bcrypt.hash(password, 10),
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const isCoach = accountType === "U11_COACH" || accountType === "U13_COACH";
    await prisma.accessRequest.create({
      data: {
        userId: created.id,
        type: isCoach ? "COACH" : "BOARD",
        requestedDivision: accountType === "U11_COACH" ? "U11" : accountType === "U13_COACH" ? "U13" : null,
        status: "PENDING",
      },
    });

    return NextResponse.json({ ok: true, status: "PENDING", user: created }, { status: 201 });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Unknown error";
    if (message.toLowerCase().includes("unique")) {
      return NextResponse.json({ ok: false, error: "An account with that email already exists." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to create account." }, { status: 500 });
  }
}
