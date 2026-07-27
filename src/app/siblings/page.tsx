"use client";

import { useEffect, useMemo, useState } from "react";

type Division = "U11" | "U13";

type SiblingPlayer = {
  playerId: string;
  playerName: string;
  rating: number | null;
  isGoalie: boolean;
  isDrafted: boolean;
  costLabel: string;
  costDetail: string;
  targetRound: number | null;
};

type SiblingGroup = {
  groupKey: string;
  registrantName: string;
  players: SiblingPlayer[];
};

type SiblingEvent = {
  draftEventId: string;
  eventName: string;
  division: Division;
  phase: string;
  isActive: boolean;
  groups: SiblingGroup[];
  siblingPlayers: number;
};

function Stars({ rating }: { rating: number | null }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={rating ? `${rating} stars` : "No rating"}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= (rating ?? 0) ? "text-amber-400" : "text-slate-300"}>★</span>
      ))}
    </span>
  );
}

const RULES = [
  ["5★", "Next team pick"],
  ["4★", "Round 3"],
  ["3★", "Round 6"],
  ["2★", "Round 9"],
  ["1★", "Round 12"],
];

export default function SiblingsPage() {
  const [events, setEvents] = useState<SiblingEvent[]>([]);
  const [division, setDivision] = useState<Division>("U13");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/draft/siblings", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error ?? "Failed to load sibling groups");
      const nextEvents = Array.isArray(json?.events) ? json.events : [];
      setEvents(nextEvents);
      if (!nextEvents.some((event: SiblingEvent) => event.division === division) && nextEvents[0]?.division) {
        setDivision(nextEvents[0].division);
      }
    } catch (loadError: any) {
      setError(loadError?.message ?? "Failed to load sibling groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selected = events.find((event) => event.division === division) ?? null;
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = selected?.groups ?? [];
    if (!query) return source;
    return source.filter((group) =>
      `${group.registrantName} ${group.players.map((player) => player.playerName).join(" ")}`
        .toLowerCase()
        .includes(query)
    );
  }, [search, selected]);

  return (
    <main className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto w-full max-w-6xl px-4">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-blue-950 px-6 py-7 text-white">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">Draft-night protection</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Sibling Draft Costs</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-slate-300">
                  U11 and U13 are tracked separately. Drafting one sibling immediately reserves every other undrafted sibling
                  on the same team at the cost determined by that sibling&apos;s star rating.
                </p>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black hover:bg-white/20 disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-5">
              {RULES.map(([stars, cost]) => (
                <div key={stars} className="rounded-xl border border-white/10 bg-white/10 p-3">
                  <div className="font-black text-amber-300">{stars}</div>
                  <div className="mt-1 text-xs font-bold text-slate-200">{cost}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-400">
              The 2-star cost follows the same three-round progression and is placed in Round 9. If a target slot has passed
              or is already reserved, the system uses that team&apos;s next available pick.
            </p>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              {(["U11", "U13"] as Division[]).map((item) => {
                const event = events.find((candidate) => candidate.division === item);
                return (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setDivision(item)}
                    disabled={!event}
                    className={`rounded-xl border px-5 py-3 text-left transition ${
                      division === item
                        ? "border-indigo-700 bg-indigo-700 text-white shadow-lg"
                        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <div className="text-sm font-black">{item} Siblings</div>
                    <div className={`mt-0.5 text-xs font-semibold ${division === item ? "text-indigo-100" : "text-slate-500"}`}>
                      {event ? `${event.groups.length} families · ${event.siblingPlayers} players` : "No event"}
                    </div>
                  </button>
                );
              })}

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search parent or player…"
                className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-4 py-3 font-medium text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-800">{error}</div> : null}

            {selected ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-black text-slate-950">{selected.eventName}</div>
                  <div className="text-xs font-semibold text-slate-500">{selected.phase}{selected.isActive ? " · Active draft" : ""}</div>
                </div>
                <div className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">
                  {groups.length} sibling {groups.length === 1 ? "family" : "families"}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {groups.map((group) => (
                <article key={group.groupKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Registrant</div>
                    <div className="mt-0.5 text-lg font-black">{group.registrantName}</div>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {group.players.map((player) => (
                      <div key={player.playerId} className={`p-4 ${player.isGoalie ? "bg-sky-50" : "bg-white"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-black text-slate-950">{player.playerName}</h2>
                              {player.isGoalie ? <span className="rounded-full bg-sky-700 px-2.5 py-1 text-xs font-black text-white">GOALKEEPER</span> : null}
                              {player.isDrafted ? <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-black text-white">RESERVED / DRAFTED</span> : null}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-600">
                              <Stars rating={player.rating} />
                              <span>{player.rating ? `${player.rating}-star player` : "Rating needed"}</span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-right">
                            <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">Automatic cost</div>
                            <div className="text-base font-black text-amber-950">{player.costLabel}</div>
                          </div>
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{player.costDetail}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {!loading && !error && groups.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center font-semibold text-slate-500">
                No sibling families match this division and search.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
