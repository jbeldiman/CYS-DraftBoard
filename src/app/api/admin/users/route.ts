import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

function accessLevel(user: {
  role: string;
  isDraftCoach: boolean;
  coachDivision: "U11" | "U13" | null;
}) {
  if (user.role === "ADMIN") return "ADMIN";
  if (user.role === "BOARD") return "BOARD";
  if (user.isDraftCoach && user.coachDivision === "U11") return "U11_COACH";
  if (user.isDraftCoach && user.coachDivision === "U13") return "U13_COACH";
  return "PARENT";
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
        createdAt: true,
        updatedAt: true,
      },
    });

    const mapped = users.map((user) => ({
      ...user,
      accessLevel: accessLevel(user),
      isCurrentUser: user.id === currentUserId,
    }));

    const counts = {
      total: mapped.length,
      ADMIN: mapped.filter((user) => user.accessLevel === "ADMIN").length,
      BOARD: mapped.filter((user) => user.accessLevel === "BOARD").length,
      U11_COACH: mapped.filter((user) => user.accessLevel === "U11_COACH").length,
      U13_COACH: mapped.filter((user) => user.accessLevel === "U13_COACH").length,
      PARENT: mapped.filter((user) => user.accessLevel === "PARENT").length,
    };

    return NextResponse.json({ users: mapped, counts });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load users" }, { status: 500 });
  }
}
