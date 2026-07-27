import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";
import { coachesDivision, divisionCoachOrder } from "@/lib/coachAccess";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const currentUserId = String((session?.user as any)?.id ?? "");
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }, { createdAt: "asc" }],
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
        isViewer: true,
        u11CoachOrder: true,
        u13CoachOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const mapped = users.map((user) => {
      const isAdminAccount = user.role === "ADMIN";
      const isBoardMember = user.role === "BOARD";
      const coachesU11 = coachesDivision(user, "U11");
      const coachesU13 = coachesDivision(user, "U13");
      return {
        ...user,
        isAdminAccount,
        isBoardMember,
        coachesU11,
        coachesU13,
        u11CoachOrder: divisionCoachOrder(user, "U11"),
        u13CoachOrder: divisionCoachOrder(user, "U13"),
        hasNoDraftAccess: !isAdminAccount && !isBoardMember && !coachesU11 && !coachesU13 && !user.isViewer,
        isCurrentUser: user.id === currentUserId,
      };
    });

    const counts = {
      total: mapped.length,
      ADMIN: mapped.filter((user) => user.isAdminAccount).length,
      BOARD: mapped.filter((user) => user.isBoardMember).length,
      U11_COACH: mapped.filter((user) => user.coachesU11).length,
      U13_COACH: mapped.filter((user) => user.coachesU13).length,
      VIEWER: mapped.filter((user) => user.isViewer).length,
      PARENT: mapped.filter((user) => user.hasNoDraftAccess).length,
    };

    return NextResponse.json({ users: mapped, counts });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load users" }, { status: 500 });
  }
}
