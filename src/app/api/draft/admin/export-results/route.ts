import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAdmin(session: unknown): boolean {
  return Boolean(
    session &&
      typeof session === "object" &&
      "user" in session &&
      (session as { user?: { role?: string } }).user?.role === "ADMIN"
  );
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "cys-draft";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const event = await prisma.draftEvent.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      players: {
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          draftedTeam: { select: { name: true } },
          picks: {
            where: {},
            orderBy: { overallNumber: "asc" },
            select: {
              overallNumber: true,
              round: true,
              pickInRound: true,
              madeAt: true,
              team: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "No draft event exists yet." }, { status: 404 });
  }

  const headers = [
    "Draft Event",
    "Draft Date",
    "Draft Phase",
    "Draft Status",
    "Overall Pick",
    "Round",
    "Pick In Round",
    "Team",
    "Drafted At",
    "Player ID (Legacy)",
    "Registration ID",
    "First Name",
    "Last Name",
    "Full Name",
    "DOB",
    "Birth Year",
    "Gender",
    "League Choice",
    "Requested U13",
    "Evaluation Number",
    "Rank",
    "Spring 2025 Rating",
    "Fall 2025 Rating",
    "Spring 2026 Rating",
    "Goalie",
    "Evaluation Attended",
    "Draft Eligible",
    "Experience / Notes",
  ];

  const rows = event.players
    .map((player) => {
      const pick = player.picks[0] ?? null;
      return {
        sortPick: pick?.overallNumber ?? Number.MAX_SAFE_INTEGER,
        sortName: `${player.lastName}\u0000${player.firstName}`,
        values: [
          event.name,
          event.scheduledAt,
          event.phase,
          pick ? "Drafted" : "Undrafted",
          pick?.overallNumber ?? "",
          pick?.round ?? "",
          pick?.pickInRound ?? "",
          pick?.team.name ?? player.draftedTeam?.name ?? "",
          pick?.madeAt ?? player.draftedAt ?? "",
          player.id,
          player.registrationId ?? "",
          player.firstName,
          player.lastName,
          player.fullName,
          player.dob ?? "",
          player.birthYear ?? "",
          player.gender ?? "",
          player.leagueChoice ?? "",
          player.wantsU13 ? "Yes" : "No",
          player.evalNumber ?? "",
          player.rank ?? "",
          player.spring2025Rating ?? "",
          player.fall2025Rating ?? "",
          player.spring2026Rating ?? "",
          player.isGoalie ? "Yes" : "No",
          player.evalAttended ? "Yes" : "No",
          player.isDraftEligible ? "Yes" : "No",
          player.experience ?? player.notes ?? "",
        ],
      };
    })
    .sort((a, b) => a.sortPick - b.sortPick || a.sortName.localeCompare(b.sortName));

  const csv = [headers, ...rows.map((row) => row.values)]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const eventDate = event.scheduledAt.toISOString().slice(0, 10);
  const filename = `${safeFilenamePart(event.name)}-${eventDate}-results.csv`;

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
