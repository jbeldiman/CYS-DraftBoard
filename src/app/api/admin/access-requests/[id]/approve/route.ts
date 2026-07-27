import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { legacyCoachFields, type CoachDivision } from "@/lib/coachAccess";

export const runtime = "nodejs";

function isAdminOrBoard(session: any) {
  const role = (session?.user as any)?.role;
  return role === "ADMIN" || role === "BOARD";
}

async function extractId(
  req: Request,
  context: { params: Promise<{ id: string }> }
): Promise<string> {
  const params = await context.params;
  const fromParams = String(params?.id ?? "").trim();
  if (fromParams) return fromParams;

  const u = new URL(req.url);
  const parts = u.pathname.split("/").filter(Boolean);
  const approveIdx = parts.lastIndexOf("approve");
  if (approveIdx > 0) {
    const candidate = String(parts[approveIdx - 1] ?? "").trim();
    if (candidate && candidate !== "access-requests") return candidate;
  }
  return String(u.searchParams.get("id") ?? "").trim();
}

async function nextOrder(tx: any, division: CoachDivision) {
  if (division === "U11") {
    const result = await tx.user.aggregate({ where: { coachesU11: true }, _max: { u11CoachOrder: true } });
    return (result._max.u11CoachOrder ?? 0) + 1;
  }
  const result = await tx.user.aggregate({ where: { coachesU13: true }, _max: { u13CoachOrder: true } });
  return (result._max.u13CoachOrder ?? 0) + 1;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdminOrBoard(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const requestId = await extractId(req, context);
    if (!requestId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const decisionNotes = typeof body?.decisionNotes === "string" ? body.decisionNotes.trim() : "";
    const meId = String((session.user as any)?.id ?? "").trim();
    if (!meId) return NextResponse.json({ error: "Missing session user id" }, { status: 401 });

    const ar = await prisma.accessRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, type: true, requestedDivision: true, userId: true },
    });
    if (!ar) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (ar.status !== "PENDING") return NextResponse.json({ error: "Request is not pending" }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: ar.userId } });
      if (!current) throw new Error("Requesting user was not found");

      if (ar.type === "BOARD") {
        await tx.user.update({
          where: { id: ar.userId },
          data: { role: current.role === "ADMIN" ? "ADMIN" : "BOARD" },
        });
      } else if (ar.type === "VIEWER") {
        await tx.user.update({
          where: { id: ar.userId },
          data: { isViewer: true },
        });
      } else {
        const division = ar.requestedDivision as CoachDivision | null;
        if (!division) throw new Error("Coach request is missing a division");

        const coachesU11 = division === "U11" ? true : current.coachesU11;
        const coachesU13 = division === "U13" ? true : current.coachesU13;
        const u11CoachOrder =
          division === "U11" && (!current.coachesU11 || current.u11CoachOrder <= 0)
            ? await nextOrder(tx, "U11")
            : current.u11CoachOrder;
        const u13CoachOrder =
          division === "U13" && (!current.coachesU13 || current.u13CoachOrder <= 0)
            ? await nextOrder(tx, "U13")
            : current.u13CoachOrder;

        await tx.user.update({
          where: { id: ar.userId },
          data: {
            role: current.role === "ADMIN" || current.role === "BOARD" ? current.role : "COACH",
            coachesU11,
            coachesU13,
            u11CoachOrder,
            u13CoachOrder,
            ...legacyCoachFields({ coachesU11, coachesU13, u11CoachOrder, u13CoachOrder }),
          },
        });
      }

      await tx.accessRequest.update({
        where: { id: ar.id },
        data: {
          status: "APPROVED",
          decidedAt: new Date(),
          decidedById: meId,
          decisionNotes: decisionNotes || null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to approve request" }, { status: 500 });
  }
}
