"use client";

import React, { useEffect, useMemo, useState } from "react";

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function Stars({ value }: { value: number | null }) {
  const v = value == null ? 0 : clamp(Math.round(value), 0, 5);
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={value == null ? "No rating" : `${v} out of 5`}
      title={value == null ? "No rating" : `${v} / 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cx("text-base leading-none", i < v ? "text-amber-500" : "text-muted-foreground/40")}
        >
          ★
        </span>
      ))}
    </div>
  );
}

type PlayerRow = {
  id: string;
  fullName: string;
  drafted: boolean;
  teamName: string | null;
  rating: number | null;
};

function toNumberOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rankToStars(rank: number | null): number | null {
  if (rank == null) return null;
  if (rank <= 10) return 5;
  if (rank <= 20) return 4;
  if (rank <= 30) return 3;
  if (rank <= 40) return 2;
  return 1;
}

function extractRating(p: any): number | null {
  const candidates = [
    p?.rating,
    p?.boardRating,
    p?.playerRating,
    p?.ratingValue,
    p?.ratingStars,
    p?.stars,
    p?.spring2025Rating,
    p?.fall2025Rating,
    p?.springRating,
    p?.fallRating,
    p?.ratingSpring2025,
    p?.ratingFall2025,
  ];

  for (const c of candidates) {
    const n = toNumberOrNull(c);
    if (n != null) return n;
  }

  const rank =
    toNumberOrNull(p?.rank) ??
    toNumberOrNull(p?.playerRank) ??
    toNumberOrNull(p?.ratingRank) ??
    toNumberOrNull(p?.overallRank) ??
    null;

  const starsFromRank = rankToStars(rank);
  if (starsFromRank != null) return starsFromRank;

  return null;
}

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/draft/players?includeRatings=true", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const rows = (json.players ?? []) as any[];

      const mapped: PlayerRow[] = rows.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        drafted: !!(p.draftedAt ?? p.isDrafted ?? p.drafted),
        teamName: p.team?.name ?? p.draftedByTeam?.name ?? p.teamName ?? null,
        rating: extractRating(p),
      }));

      mapped.sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
      setPlayers(mapped);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load players");
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [players, q]);

  return (
    <div className="py-4 space-y-4">
      <div className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Full Player List</h1>
            <div className="text-sm text-muted-foreground">{players.length} total</div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-9 w-56 rounded-md border px-3 text-sm"
            />
            <button onClick={load} className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
              Refresh
            </button>
          </div>
        </div>

        {err ? <div className="mt-3 text-sm text-rose-600">{err}</div> : null}

        {loading ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="mt-4 rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-12 bg-muted px-3 py-2 text-xs font-semibold">
              <div className="col-span-5">Player</div>
              <div className="col-span-3">Rating</div>
              <div className="col-span-2">Drafted</div>
              <div className="col-span-2">Team</div>
            </div>

            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">No matches.</div>
            ) : (
              <div className="divide-y max-h-[75vh] overflow-auto">
                {filtered.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 px-3 py-2 text-sm hover:bg-muted/40 transition">
                    <div className="col-span-5 font-semibold truncate">{p.fullName}</div>
                    <div className="col-span-3 flex items-center">
                      <Stars value={p.rating} />
                    </div>
                    <div className="col-span-2 text-xs text-muted-foreground">{p.drafted ? "Yes" : "No"}</div>
                    <div className="col-span-2 text-xs text-muted-foreground truncate">{p.teamName ?? "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 text-xs text-muted-foreground">
          Data source: <span className="font-semibold">/api/draft/players</span>
        </div>
      </div>
    </div>
  );
}
