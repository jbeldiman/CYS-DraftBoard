import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/authOptions";

export const runtime = "nodejs";

function isAdmin(session: any) {
  return session?.user && (session.user as any).role === "ADMIN";
}

const FALL_2026_DIVISION_SLUGS = ["fall-2026-u11", "fall-2026-u13"];

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await prisma.draftEvent.findMany({
    where: {
      slug: {
        in: FALL_2026_DIVISION_SLUGS,
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      division: true,
      teams: {
        orderBy: {
          order: "asc",
        },
        select: {
          id: true,
          name: true,
          order: true,
          coachUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          draftedPlayers: {
            where: {
              isDrafted: true,
            },
            orderBy: [
              {
                draftedAt: "asc",
              },
              {
                lastName: "asc",
              },
              {
                firstName: "asc",
              },
            ],
            select: {
              id: true,
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
      },
    },
  });

  const divisionOrder = {
    U11: 0,
    U13: 1,
  } as const;

  const teams = events
    .flatMap((event) => {
      const division = event.division;

      if (division !== "U11" && division !== "U13") {
        return [];
      }

      return event.teams.map((team) => ({
        id: team.id,
        name: team.name,
        order: team.order,
        coachUser: team.coachUser,
        players: team.draftedPlayers,
        division,
        eventId: event.id,
        eventName: event.name,
      }));
    })
    .sort((a, b) => {
      const divisionDifference =
        divisionOrder[a.division] - divisionOrder[b.division];

      if (divisionDifference !== 0) {
        return divisionDifference;
      }

      return a.order - b.order;
    });

  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      name: event.name,
      slug: event.slug,
      division: event.division,
    })),
    teams,
  });
}
