export type SeasonKey = "spring2025" | "fall2025";

export type PlayerDraftHistoryEntry = {
  season: SeasonKey;
  year: number;
  seasonLabel: string;
  round: number;
  pickInRound: number;
  overallPick: number;
  teamName: string;
};

export type PlayerHistoryIndex = {
  seasons: SeasonKey[];
  byPlayer: Record<string, PlayerDraftHistoryEntry[]>;
};

export type RatingBySeason = Partial<Record<SeasonKey, number | null | undefined>>;

function norm(v: any): string {
  return (v ?? "").toString().trim();
}

export function normalizeName(s: string): string {
  const raw = norm(s).toLowerCase();
  const deaccent = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return deaccent
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i += 1;
          continue;
        }
      } else {
        field += c;
        i += 1;
        continue;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === ",") {
        pushField();
        i += 1;
        continue;
      }
      if (c === "\r") {
        i += 1;
        continue;
      }
      if (c === "\n") {
        pushField();
        pushRow();
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    }
  }

  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) pushRow();

  return rows;
}

function toInt(v: any): number | null {
  const s = norm(v);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function buildHistoryIndexFromDraftBoardCsvText(args: {
  season: SeasonKey;
  year: number;
  seasonLabel: string;
  csvText: string;
}): PlayerHistoryIndex {
  const matrix = parseCsv(args.csvText);
  return buildHistoryIndexFromDraftBoardMatrix({
    season: args.season,
    year: args.year,
    seasonLabel: args.seasonLabel,
    matrix,
  });
}

export function buildHistoryIndexFromDraftBoardMatrix(args: {
  season: SeasonKey;
  year: number;
  seasonLabel: string;
  matrix: string[][];
}): PlayerHistoryIndex {
  const matrix = args.matrix;
  if (!matrix.length) return { seasons: [args.season], byPlayer: {} };

  const header = matrix[0] ?? [];
  const roundColIdx = header.findIndex((h) => normalizeName(h) === "round");
  const teamCols: { idx: number; teamName: string }[] = [];

  for (let i = 0; i < header.length; i++) {
    if (i === roundColIdx) continue;
    const teamName = norm(header[i]);
    if (!teamName) continue;
    teamCols.push({ idx: i, teamName });
  }

  const numTeams = teamCols.length;
  const byPlayer: Record<string, PlayerDraftHistoryEntry[]> = {};

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const roundVal = roundColIdx >= 0 ? row[roundColIdx] : row[0];
    const round = toInt(roundVal);
    if (!round || round <= 0) continue;
    if (!numTeams) continue;

    const odd = round % 2 === 1;
    const pickOrder = odd ? teamCols : [...teamCols].reverse();

    for (let pickInRound = 1; pickInRound <= pickOrder.length; pickInRound++) {
      const col = pickOrder[pickInRound - 1];
      const playerName = norm(row[col.idx]);
      if (!playerName) continue;

      const overallPick = (round - 1) * numTeams + pickInRound;
      const entry: PlayerDraftHistoryEntry = {
        season: args.season,
        year: args.year,
        seasonLabel: args.seasonLabel,
        round,
        pickInRound,
        overallPick,
        teamName: col.teamName,
      };

      const key = normalizeName(playerName);
      if (!key) continue;

      if (!byPlayer[key]) byPlayer[key] = [];
      byPlayer[key].push(entry);
    }
  }

  for (const k of Object.keys(byPlayer)) {
    byPlayer[k].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.seasonLabel !== b.seasonLabel) return a.seasonLabel.localeCompare(b.seasonLabel);
      return a.overallPick - b.overallPick;
    });
  }

  return { seasons: [args.season], byPlayer };
}

export function mergeHistoryIndexes(indexes: PlayerHistoryIndex[]): PlayerHistoryIndex {
  const seasonsSet = new Set<SeasonKey>();
  const byPlayer: Record<string, PlayerDraftHistoryEntry[]> = {};

  for (const idx of indexes) {
    for (const s of idx.seasons) seasonsSet.add(s);
    for (const [playerKey, entries] of Object.entries(idx.byPlayer)) {
      if (!byPlayer[playerKey]) byPlayer[playerKey] = [];
      byPlayer[playerKey].push(...entries);
    }
  }

  for (const k of Object.keys(byPlayer)) {
    const seen = new Set<string>();
    const deduped: PlayerDraftHistoryEntry[] = [];
    for (const e of byPlayer[k]) {
      const id = `${e.season}|${e.year}|${e.overallPick}|${normalizeName(e.teamName)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(e);
    }
    deduped.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.season !== b.season) return a.season.localeCompare(b.season);
      return a.overallPick - b.overallPick;
    });
    byPlayer[k] = deduped;
  }

  return { seasons: Array.from(seasonsSet), byPlayer };
}

export function getPlayerHistory(index: PlayerHistoryIndex, playerFullName: string): PlayerDraftHistoryEntry[] {
  const key = normalizeName(playerFullName);
  return index.byPlayer[key] ? [...index.byPlayer[key]] : [];
}

export function formatPlayerHistoryNarrative(args: {
  playerFullName: string;
  history: PlayerDraftHistoryEntry[];
  ratings?: RatingBySeason;
}): string {
  const name = norm(args.playerFullName);
  const history = [...(args.history ?? [])].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.season !== b.season) return a.season.localeCompare(b.season);
    return a.overallPick - b.overallPick;
  });

  if (!history.length) return "";

  const parts: string[] = [];
  for (const h of history) {
    const ratingVal = args.ratings?.[h.season];
    const ratingSuffix =
      ratingVal === null || ratingVal === undefined || ratingVal === ("" as any)
        ? ""
        : ` and had an overall rating of ${Number(ratingVal)}`;

    parts.push(
      `${name} was drafted ${ordinal(h.overallPick)} overall in the ${h.year} ${h.seasonLabel} draft${ratingSuffix}`
    );
  }

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}, then ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function ordinal(n: number): string {
  const x = Math.abs(Math.trunc(n));
  const mod100 = x % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${x}th`;
  const mod10 = x % 10;
  if (mod10 === 1) return `${x}st`;
  if (mod10 === 2) return `${x}nd`;
  if (mod10 === 3) return `${x}rd`;
  return `${x}th`;
}
