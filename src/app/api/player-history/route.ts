import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import {
  buildHistoryIndexFromDraftBoardCsvText,
  mergeHistoryIndexes,
  normalizeName,
  type PlayerHistoryIndex,
  type SeasonKey,
} from "@/lib/playerHistory";

export const runtime = "nodejs";

const HISTORY_DIR = path.join(process.cwd(), "public", "history");

const HISTORIES: Array<{
  slug: string;
  season: SeasonKey;
  year: number;
  seasonLabel: string;
  filename: string;
}> = [
  {
    slug: "spring-2025-u13",
    season: "spring2025",
    year: 2025,
    seasonLabel: "Spring",
    filename: "Spring 2025 Draft Board.csv",
  },
  {
    slug: "fall-2025-u13",
    season: "fall2025",
    year: 2025,
    seasonLabel: "Fall",
    filename: "Fall 2025 Draft Board.csv",
  },
];

async function readCsv(filename: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(HISTORY_DIR, filename), "utf8");
  } catch {
    return null;
  }
}

function emptyIndex(): PlayerHistoryIndex {
  return { seasons: [], byPlayer: {} };
}

function databaseIndex(args: {
  season: SeasonKey;
  year: number;
  seasonLabel: string;
  picks: Array<{
    overallNumber: number;
    round: number;
    pickInRound: number;
    player: { fullName: string };
    team: { name: string };
  }>;
}): PlayerHistoryIndex {
  const byPlayer: PlayerHistoryIndex["byPlayer"] = {};

  for (const pick of args.picks) {
    const key = normalizeName(pick.player.fullName);
    if (!key) continue;
    if (!byPlayer[key]) byPlayer[key] = [];
    byPlayer[key].push({
      season: args.season,
      year: args.year,
      seasonLabel: args.seasonLabel,
      round: pick.round,
      pickInRound: pick.pickInRound,
      overallPick: pick.overallNumber,
      teamName: pick.team.name,
    });
  }

  return { seasons: [args.season], byPlayer };
}

export async function GET() {
  const databaseEvents = await prisma.draftEvent.findMany({
    where: { slug: { in: HISTORIES.map((history) => history.slug) } },
    select: {
      slug: true,
      picks: {
        orderBy: { overallNumber: "asc" },
        select: {
          overallNumber: true,
          round: true,
          pickInRound: true,
          player: { select: { fullName: true } },
          team: { select: { name: true } },
        },
      },
    },
  });

  const databaseEventBySlug = new Map(databaseEvents.map((event) => [event.slug, event]));
  const indexes: PlayerHistoryIndex[] = [];
  const found: Record<SeasonKey, boolean> = { spring2025: false, fall2025: false };
  const storage: Record<SeasonKey, "database" | "csv" | "missing"> = {
    spring2025: "missing",
    fall2025: "missing",
  };

  for (const history of HISTORIES) {
    const databaseEvent = databaseEventBySlug.get(history.slug);
    if (databaseEvent) {
      indexes.push(
        databaseIndex({
          season: history.season,
          year: history.year,
          seasonLabel: history.seasonLabel,
          picks: databaseEvent.picks,
        })
      );
      found[history.season] = true;
      storage[history.season] = "database";
      continue;
    }

    const csvText = await readCsv(history.filename);
    if (csvText) {
      indexes.push(
        buildHistoryIndexFromDraftBoardCsvText({
          season: history.season,
          year: history.year,
          seasonLabel: history.seasonLabel,
          csvText,
        })
      );
      found[history.season] = true;
      storage[history.season] = "csv";
    }
  }

  const merged = indexes.length ? mergeHistoryIndexes(indexes) : emptyIndex();

  return NextResponse.json({
    ok: true,
    found,
    storage,
    index: merged,
  });
}
