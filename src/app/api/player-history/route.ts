import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import {
  buildHistoryIndexFromDraftBoardCsvText,
  mergeHistoryIndexes,
  type PlayerHistoryIndex,
} from "@/lib/playerHistory";

export const runtime = "nodejs";

const HISTORY_DIR = path.join(process.cwd(), "public", "history");

const SPRING_2025_FILE = "Spring 2025 Draft Board.csv";
const FALL_2025_FILE = "Fall 2025 Draft Board.csv";

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

export async function GET() {
  const springCsv = await readCsv(SPRING_2025_FILE);
  const fallCsv = await readCsv(FALL_2025_FILE);

  const indexes: PlayerHistoryIndex[] = [];

  if (springCsv) {
    indexes.push(
      buildHistoryIndexFromDraftBoardCsvText({
        season: "spring2025",
        year: 2025,
        seasonLabel: "Spring",
        csvText: springCsv,
      })
    );
  }

  if (fallCsv) {
    indexes.push(
      buildHistoryIndexFromDraftBoardCsvText({
        season: "fall2025",
        year: 2025,
        seasonLabel: "Fall",
        csvText: fallCsv,
      })
    );
  }

  const merged = indexes.length ? mergeHistoryIndexes(indexes) : emptyIndex();

  return NextResponse.json({
    ok: true,
    found: {
      spring2025: Boolean(springCsv),
      fall2025: Boolean(fallCsv),
    },
    index: merged,
  });
}
