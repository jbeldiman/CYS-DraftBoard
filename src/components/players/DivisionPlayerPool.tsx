"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Division = "U11" | "U13";
type StatusFilter = "ALL" | "AVAILABLE" | "DRAFTED";

type HistoryEntry = {
  id: string;
  eventName: string;
  seasonYear: number | null;
  season: "SPRING" | "FALL" | null;
  division: Division | null;
  phase: string;
  rating: number | null;
  experience: string | null;
  isGoalie: boolean;
  teamName: string | null;
  overallPick: number | null;
  round: number | null;
  pickInRound: number | null;
};

type Player = {
  id: string;
  fullName: string;
  dob: string | null;
  birthYear: number | null;
  gender: string | null;
  experience: string | null;
  parentComment: string | null;
  rating: number | null;
  isGoalie: boolean;
  isDrafted: boolean;
  draftedTeam: { id: string; name: string; order: number } | null;
  evalNumber: number | null;
  siblings: string[];
  history: HistoryEntry[];
};

type Payload = {
  event: {
    id: string;
    name: string;
    phase: string;
    division: Division;
    isActive: boolean;
  };
  summary: {
    total: number;
    available: number;
    drafted: number;
    goalies: number;
    rated: number;
  };
  players: Player[];
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function Stars({ value, large = false }: { value: number | null; large?: boolean }) {
  const rating = value == null ? 0 : Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className="flex items-center gap-0.5" aria-label={value == null ? "No rating" : `${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cx(
            large ? "text-xl" : "text-base",
            "leading-none drop-shadow-sm",
            index < rating ? "text-amber-400" : "text-slate-300"
          )}
        >
          ★
        </span>
      ))}
      <span className="ml-1.5 text-xs font-bold text-slate-600">
        {value == null ? "Not rated" : `${rating}/5`}
      </span>
    </div>
  );
}

function formatDob(value: string | null) {
  if (!value) return "DOB unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "DOB unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function historyLabel(entry: HistoryEntry) {
  const season = entry.season ? entry.season.charAt(0) + entry.season.slice(1).toLowerCase() : "Past";
  return `${season} ${entry.seasonYear ?? ""} ${entry.division ?? ""}`.trim();
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function PlayerCard({ player, division }: { player: Player; division: Division }) {
  const [expanded, setExpanded] = useState(false);
  const comment = player.parentComment?.trim();
  const experience = player.experience?.trim();

  return (
    <article
      className={cx(
        "group relative overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
        player.isGoalie
          ? "border-sky-300 ring-2 ring-sky-100"
          : "border-slate-200"
      )}
    >
      <div
        className={cx(
          "absolute inset-x-0 top-0 h-1.5",
          player.isGoalie
            ? "bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500"
            : division === "U11"
              ? "bg-gradient-to-r from-emerald-500 to-lime-400"
              : "bg-gradient-to-r from-violet-500 to-fuchsia-400"
        )}
      />

      <div className="p-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-black tracking-tight text-slate-950">{player.fullName}</h2>
              {player.isGoalie ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-black tracking-wide text-sky-800 ring-1 ring-sky-200">
                  🧤 GOALKEEPER
                </span>
              ) : null}
              {player.isDrafted ? (
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
                  DRAFTED
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                  AVAILABLE
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {formatDob(player.dob)} · Birth year {player.birthYear ?? "—"}
            </div>
          </div>
          {player.evalNumber ? (
            <div className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-slate-950 px-2 text-sm font-black text-white shadow-sm">
              #{player.evalNumber}
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <Stars value={player.rating} large />
        </div>

        {player.draftedTeam ? (
          <div className="mt-4 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
            Drafted by {player.draftedTeam.name}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          <section>
            <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Experience</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {experience || "No experience notes provided."}
            </p>
          </section>

          <section className={cx("rounded-2xl p-3", comment ? "bg-amber-50 ring-1 ring-amber-100" : "bg-slate-50")}>
            <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Parent comment</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {comment || "No parent comment provided."}
            </p>
          </section>
        </div>

        {player.siblings.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">Sibling</span>
            {player.siblings.map((sibling) => (
              <span key={sibling} className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
                {sibling}
              </span>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <span>Past season experience</span>
          <span>{expanded ? "Hide" : `${player.history.length} season${player.history.length === 1 ? "" : "s"}`}</span>
        </button>

        {expanded ? (
          <div className="mt-3 space-y-2">
            {player.history.length ? (
              player.history.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-black text-slate-900">{historyLabel(entry)}</div>
                    <Stars value={entry.rating} />
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {entry.teamName
                      ? `Team: ${entry.teamName}${entry.overallPick ? ` · Pick #${entry.overallPick}` : ""}`
                      : "No prior draft selection recorded"}
                  </div>
                  {entry.experience ? (
                    <div className="mt-1 text-xs leading-5 text-slate-500">{entry.experience}</div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">No prior CYS season is linked yet.</div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function DivisionPlayerPool({ division }: { division: Division }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("AVAILABLE");
  const [rating, setRating] = useState("ALL");
  const [goaliesOnly, setGoaliesOnly] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/draft/division-players?division=${division}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Unable to load player pool");
      setPayload(body as Payload);
    } catch (caught: any) {
      setError(caught?.message ?? "Unable to load player pool");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [division]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...(payload?.players ?? [])]
      .filter((player) => !normalizedQuery || player.fullName.toLowerCase().includes(normalizedQuery))
      .filter((player) => status === "ALL" || (status === "AVAILABLE" ? !player.isDrafted : player.isDrafted))
      .filter((player) => rating === "ALL" || player.rating === Number(rating))
      .filter((player) => !goaliesOnly || player.isGoalie)
      .sort((a, b) => {
        if (a.isDrafted !== b.isDrafted) return a.isDrafted ? 1 : -1;
        if (a.isGoalie !== b.isGoalie) return a.isGoalie ? -1 : 1;
        const ratingDifference = (b.rating ?? -1) - (a.rating ?? -1);
        if (ratingDifference) return ratingDifference;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [payload, query, status, rating, goaliesOnly]);

  const palette = division === "U11"
    ? "from-emerald-950 via-emerald-800 to-lime-600"
    : "from-violet-950 via-violet-800 to-fuchsia-600";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6">
      <section className={cx("relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white shadow-xl sm:p-8", palette)}>
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-white/70">Fall 2026 Draft Pool</div>
              <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{division} Eligible Players</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
                Ratings, goalie identification, family comments, current experience, siblings, and linked draft history—kept completely separate from the other division.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={division === "U11" ? "/players/u13" : "/players/u11"}
                className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/20"
              >
                View {division === "U11" ? "U13" : "U11"} Pool
              </Link>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm transition hover:bg-white/90"
              >
                Refresh
              </button>
            </div>
          </div>

          {payload ? (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/15 px-3 py-1.5">{payload.event.name}</span>
              <span className="rounded-full bg-white/15 px-3 py-1.5">{payload.event.phase}</span>
              {payload.event.isActive ? <span className="rounded-full bg-lime-300 px-3 py-1.5 text-emerald-950">ACTIVE DRAFT</span> : null}
            </div>
          ) : null}
        </div>
      </section>

      {payload ? (
        <section className="relative -mt-3 grid grid-cols-2 gap-3 px-3 sm:grid-cols-5">
          <SummaryCard label="Players" value={payload.summary.total} detail={`${division} only`} />
          <SummaryCard label="Available" value={payload.summary.available} detail="Ready to draft" />
          <SummaryCard label="Goalies" value={payload.summary.goalies} detail="Highlighted in blue" />
          <SummaryCard label="Rated" value={payload.summary.rated} detail="CSV star ratings" />
          <SummaryCard label="Drafted" value={payload.summary.drafted} detail="Current event only" />
        </section>
      ) : null}

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${division} player...`}
            className="h-11 w-full px-4 text-sm"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-11 px-3 text-sm font-semibold">
            <option value="AVAILABLE">Available only</option>
            <option value="ALL">All players</option>
            <option value="DRAFTED">Drafted only</option>
          </select>
          <select value={rating} onChange={(event) => setRating(event.target.value)} className="h-11 px-3 text-sm font-semibold">
            <option value="ALL">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}-star players</option>)}
          </select>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold">
            <input type="checkbox" checked={goaliesOnly} onChange={(event) => setGoaliesOnly(event.target.checked)} className="h-4 w-4" />
            Goalies only
          </label>
        </div>
        <div className="mt-3 text-sm text-slate-500">Showing <strong className="text-slate-900">{filtered.length}</strong> players.</div>
      </section>

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-3xl bg-slate-200" />)}
        </div>
      ) : filtered.length ? (
        <div className="mt-6 grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((player) => <PlayerCard key={player.id} player={player} division={division} />)}
        </div>
      ) : !error ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="text-xl font-black text-slate-900">No players match these filters.</div>
          <div className="mt-2 text-sm text-slate-500">Clear a filter or refresh the pool.</div>
        </div>
      ) : null}
    </div>
  );
}
