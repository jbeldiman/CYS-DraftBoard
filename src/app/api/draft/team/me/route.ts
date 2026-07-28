import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teams = await prisma.draftTeam.findMany({
    where: {
      coachUserId: userId,
      draftEvent: {
        is: {
          seasonYear: 2026,
          season: "FALL",
          division: {
            in: ["U11", "U13"],
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      order: true,
      draftEvent: {
        select: {
          id: true,
          name: true,
          division: true,
        },
      },
      draftedPlayers: {
        where: {
          isDrafted: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          dob: true,
          gender: true,
          jerseySize: true,
          guardian1Name: true,
          guardian2Name: true,
          primaryPhone: true,
          primaryEmail: true,
        },
      },
    },
  });

  const rosters = teams
    .flatMap((team) => {
      const division = team.draftEvent.division;

      if (division !== "U11" && division !== "U13") {
        return [];
      }

      return [
        {
          division,
          event: {
            id: team.draftEvent.id,
            name: team.draftEvent.name,
          },
          team: {
            id: team.id,
            name: team.name,
            order: team.order,
          },
          players: team.draftedPlayers,
        },
      ];
    })
    .sort((a, b) => {
      const divisionDifference = a.division.localeCompare(b.division);
      if (divisionDifference !== 0) return divisionDifference;

      return a.team.order - b.team.order;
    });

  const firstRoster = rosters[0] ?? null;

  return NextResponse.json({
    rosters,
    // Preserve the original response fields for compatibility.
    team: firstRoster?.team ?? null,
    players: firstRoster?.players ?? [],
  });
}
