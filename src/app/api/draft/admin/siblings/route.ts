import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

async function latestEventId() {
  const e = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!e?.id) throw new Error("No draft event found");
  return e.id;
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const groupKey = (body?.groupKey ?? "").toString().trim().toLowerCase();
    const draftCost = toIntOrNull(body?.draftCost);

    if (!groupKey) {
      return NextResponse.json({ error: "Missing groupKey" }, { status: 400 });
    }

    const draftEventId = await latestEventId();

    const record = await prisma.siblingDraftCost.upsert({
      where: {
        draftEventId_groupKey: {
          draftEventId,
          groupKey,
        },
      },
      update: {
        draftCost,
      },
      create: {
        draftEventId,
        groupKey,
        draftCost,
      },
    });

    return NextResponse.json({
      ok: true,
      draftEventId,
      groupKey: record.groupKey,
      draftCost: record.draftCost,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ? String(err.message) : "Failed to save draft cost" },
      { status: 500 }
    );
  }
}
