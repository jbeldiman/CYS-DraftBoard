"use client";

import React, { useEffect, useMemo, useState } from "react";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs shadow-sm whitespace-nowrap",
        tone === "good" &&
          "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:border-emerald-900/40",
        tone === "warn" &&
          "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40",
        tone === "bad" &&
          "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/30 dark:text-rose-100 dark:border-rose-900/40",
        tone === "neutral" && "bg-card text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function Stars({
  value,
  size = "sm",
  showEmpty = true,
}: {
  value: number | null;
  size?: "sm" | "md";
  showEmpty?: boolean;
}) {
  const v = value == null ? 0 : clamp(Math.round(value), 0, 5);
  const textSize = size === "md" ? "text-base" : "text-sm";
  return (
    <div
      className={cx("flex items-center gap-0.5", textSize)}
      aria-label={value == null ? "No rating" : `${v} out of 5`}
      title={value == null ? "No rating" : `${v} / 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const on = i < v;
        if (!showEmpty && !on) return null;
        return (
          <span
            key={i}
            className={cx(
              "leading-none",
              on ? "text-amber-500" : "text-muted-foreground/30"
            )}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}

type Team = { id: string; name: string; order: number };

type DraftPick = {
  id: string;
  overallNumber: number;
  round: number;
  pickInRound: number;
  madeAt: string;
  team: { id: string; name: string; order: number };
  player: { id: string; fullName: string; rank: number | null };
};

type DraftState = {
  event: {
    id: string;
    name: string;
    scheduledAt: string;
    phase: "SETUP" | "LIVE" | "COMPLETE";
    currentPick: number;
    pickClockSeconds: number;
    isPaused: boolean;
    clockEndsAt: string | null;
    pauseRemainingSecs: number | null;
  } | null;
  teams: Team[];
  recentPicks: DraftPick[];
  counts: { undrafted: number; drafted: number };
};

type RemainingPlayer = {
  id: string;
  fullName: string;
  rating: number | null;
};

const FALLBACK_TEAMS_ENDPOINT = "/api/admin/teams";
const OPTIONAL_ALL_PICKS_ENDPOINT = "/api/draft/picks";

function snakeTeamIndexFromOverallPick(overallPick1: number, teamCount: number) {
  if (teamCount <= 0) return { round: 1, index: 0, posInRound: 0 };
  const p0 = overallPick1 - 1;
  const round = Math.floor(p0 / teamCount) + 1;
  const posInRound = p0 % teamCount;
  const isReverse = round % 2 === 0;
  const index = isReverse ? teamCount - 1 - posInRound : posInRound;
  return { round, index, posInRound };
}

function teamShort(name: string) {
  const s = (name || "").trim();
  if (!s) return "—";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 8);
  const initials = parts.map((p) => p[0]?.toUpperCase()).join("");
  return initials.slice(0, 4);
}

function ratingFromRank(rank: number | null) {
  if (rank == null) return null;
  if (rank <= 10) return 5;
  if (rank <= 20) return 4;
  if (rank <= 30) return 3;
  if (rank <= 40) return 2;
  return 1;
}

export default function LiveDraftPage() {
  const fallbackScheduledTarget = useMemo(
    () => new Date(Date.UTC(2026, 1, 16, 23, 0, 0)),
    []
  );

  const [now, setNow] = useState(() => new Date());
  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);

  const [teams, setTeams] = useState<Team[]>([]);
  const [allPicks, setAllPicks] = useState<DraftPick[] | null>(null);

  const [remaining, setRemaining] = useState<RemainingPlayer[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function loadState() {
    try {
      const res = await fetch("/api/draft/state", { cache: "no-store" });
      const json = (await res.json()) as DraftState;
      setState(json);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamsFallbackIfNeeded(nextState?: DraftState | null) {
    const st = nextState ?? state;
    const stTeams = st?.teams ?? [];
    if (stTeams.length) {
      setTeams(stTeams.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      return;
    }

    try {
      const res = await fetch(FALLBACK_TEAMS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error("no teams");
      const json = await res.json().catch(() => ({}));
      const t = (json.teams ?? json ?? []) as any[];
      const mapped: Team[] = (Array.isArray(t) ? t : []).map((x: any, i: number) => ({
        id: x.id,
        name: x.name ?? x.teamName ?? `Team ${i + 1}`,
        order: x.order ?? x.pickOrder ?? i + 1,
      }));
      setTeams(mapped.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    } catch {
      setTeams([]);
    }
  }

  async function loadAllPicksOptional() {
    try {
      const res = await fetch(OPTIONAL_ALL_PICKS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error("no picks endpoint");
      const json = await res.json().catch(() => ({}));
      const picks = (json.picks ?? []) as DraftPick[];
      if (Array.isArray(picks)) setAllPicks(picks);
    } catch {
      
    }
  }

  async function loadRemaining() {
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));

      setRemaining(
        (json.players ?? []).map((p: any) => {
          const rawRating = p.rating ?? p.boardRating ?? p.playerRating ?? null;
          const rank = p.rank ?? p.playerRank ?? null;
          const fallback = ratingFromRank(rank);
          return {
            id: p.id,
            fullName: p.fullName,
            rating: rawRating ?? fallback,
          } as RemainingPlayer;
        })
      );
    } catch {
      setRemaining([]);
    }
  }

  useEffect(() => {
    (async () => {
      await loadState();
    })();
    loadRemaining();
    loadAllPicksOptional();

    const t = setInterval(() => {
      loadState();
      loadRemaining();
      loadAllPicksOptional();
    }, 2000);

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadTeamsFallbackIfNeeded(state);
   
  }, [state?.teams?.length]);

  const event = state?.event ?? null;
  const isLive = event?.phase === "LIVE";

  const scheduledTarget = useMemo(() => {
    if (event?.scheduledAt) {
      const d = new Date(event.scheduledAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return fallbackScheduledTarget;
  }, [event?.scheduledAt, fallbackScheduledTarget]);

  const scheduledDiffMs = Math.max(0, scheduledTarget.getTime() - now.getTime());
  const scheduledTotalSeconds = Math.floor(scheduledDiffMs / 1000);
  const scheduledDays = Math.floor(scheduledTotalSeconds / (60 * 60 * 24));
  const scheduledHours = Math.floor((scheduledTotalSeconds % (60 * 60 * 24)) / (60 * 60));
  const scheduledMinutes = Math.floor((scheduledTotalSeconds % (60 * 60)) / 60);
  const scheduledSeconds = scheduledTotalSeconds % 60;

  const scheduledLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(scheduledTarget);
    } catch {
      return "02/16/2026 6:00 PM ET";
    }
  }, [scheduledTarget]);

  const liveClock = useMemo(() => {
    if (!event) return { remaining: null as number | null };
    if (event.isPaused) return { remaining: event.pauseRemainingSecs ?? event.pickClockSeconds };
    if (!event.clockEndsAt) return { remaining: null };
    const endsAt = new Date(event.clockEndsAt);
    const remainingSecs = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
    return { remaining: remainingSecs };
  }, [event, now]);

  const liveRemaining = liveClock.remaining;
  const liveTotalSeconds = liveRemaining ?? 0;
  const liveMin = Math.floor(liveTotalSeconds / 60);
  const liveSec = liveTotalSeconds % 60;

  const teamCount = teams.length;

  const picks = useMemo(() => {
    const src = (allPicks && Array.isArray(allPicks) ? allPicks : state?.recentPicks ?? []) as DraftPick[];
    return src
      .slice()
      .filter((p) => p && typeof p.overallNumber === "number")
      .sort((a, b) => (a.overallNumber ?? 0) - (b.overallNumber ?? 0));
  }, [allPicks, state?.recentPicks]);

  const lastPick = picks.length ? picks[picks.length - 1] : null;

  const onClock = useMemo(() => {
    const cur = event?.currentPick ?? 1;
    if (!teamCount) return { team: null as Team | null, round: 1, pickInRound: 1, overall: cur };
    const { round, index, posInRound } = snakeTeamIndexFromOverallPick(cur, teamCount);
    return { team: teams[index] ?? null, round, pickInRound: posInRound + 1, overall: cur };
  }, [event?.currentPick, teamCount, teams]);

  const onDeck = useMemo(() => {
    const cur = (event?.currentPick ?? 1) + 1;
    if (!teamCount) return { team: null as Team | null, overall: cur };
    const { index } = snakeTeamIndexFromOverallPick(cur, teamCount);
    return { team: teams[index] ?? null, overall: cur };
  }, [event?.currentPick, teamCount, teams]);

  const upcoming = useMemo(() => {
    const start = event?.currentPick ?? 1;
    const count = 8;
    if (!teamCount) return [] as Array<{ overall: number; team: Team | null; round: number; pickInRound: number }>;
    return Array.from({ length: count }).map((_, i) => {
      const overall = start + i;
      const { round, index, posInRound } = snakeTeamIndexFromOverallPick(overall, teamCount);
      return { overall, team: teams[index] ?? null, round, pickInRound: posInRound + 1 };
    });
  }, [event?.currentPick, teamCount, teams]);

  const remainingCount = remaining.length;
  const draftedCount = state?.counts?.drafted ?? picks.length;

  const filteredRemaining = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return remaining;
    return remaining.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [remaining, q]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-lg font-semibold">Loading…</div>
        <div className="mt-2 text-sm text-muted-foreground">Connecting to draft state</div>
      </div>
    );
  }

  if (!isLive) {
    return (
      <div className="py-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-semibold tracking-tight">Live Draft</h1>
            <Pill tone="neutral">Status: {event?.phase ?? "SETUP"}</Pill>
          </div>
          <p className="text-sm text-muted-foreground">Countdown to {scheduledLabel}</p>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{scheduledDays}</div>
            <div className="mt-1 text-sm text-muted-foreground">Days</div>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{pad2(scheduledHours)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Hours</div>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{pad2(scheduledMinutes)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Minutes</div>
          </div>
          <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="text-4xl font-bold tabular-nums">{pad2(scheduledSeconds)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Seconds</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Draft Event</div>
              <div className="mt-1 font-semibold">{event?.name ?? "CYS Draft"}</div>
            </div>
            <div className="flex items-center gap-2">
              <Pill tone="neutral">Remaining: {remainingCount}</Pill>
              <Pill tone="neutral">Drafted: {draftedCount}</Pill>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3">
      {/* Header / status */}
      <div
        className={cx(
          "rounded-3xl border p-4 sm:p-6 shadow-sm",
          event?.isPaused ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-emerald-50/60 dark:bg-emerald-950/20"
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">Live Draft</h1>
              <div className="mt-1 text-xs sm:text-sm text-muted-foreground">
                {event?.name ?? "CYS Draft"} · Scheduled: {scheduledLabel}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {event?.isPaused ? <Pill tone="warn">⏸ Paused</Pill> : <Pill tone="good">● Live</Pill>}
                <Pill tone="neutral">Pick #{event?.currentPick ?? 1}</Pill>
                <Pill tone="neutral">Teams: {teams.length}</Pill>
                <Pill tone="neutral">Drafted: {draftedCount}</Pill>
                <Pill tone="neutral">Remaining: {remainingCount}</Pill>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">Pick Clock</div>
                <div className="mt-1 text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">
                  {pad2(liveMin)}:{pad2(liveSec)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {event?.isPaused ? "Paused — clock held" : "Time remaining"}
                </div>
              </div>

              <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm">
                <div className="text-[11px] text-muted-foreground">On the Clock</div>
                <div className="mt-1 text-base sm:text-xl font-semibold truncate">{onClock.team?.name ?? "—"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!event?.isPaused ? <Pill tone="good">● Picking</Pill> : <Pill tone="warn">⏸ Waiting</Pill>}
                  <Pill tone="neutral">
                    R{onClock.round} · P{onClock.pickInRound}
                  </Pill>
                </div>
              </div>

              <div className="rounded-2xl border bg-card px-4 py-3 shadow-sm col-span-2 lg:col-span-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-muted-foreground">Last Pick</div>
                    <div className="mt-1 text-sm font-semibold truncate">{lastPick?.player.fullName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{lastPick?.team?.name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">On Deck</div>
                    <div className="mt-1 text-sm font-semibold truncate">{onDeck.team?.name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">Pick #{onDeck.overall}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Draft order strip */}
          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Draft Order</div>
                <div className="text-[11px] text-muted-foreground">
                  Live snake order · shows the next {upcoming.length} picks
                </div>
              </div>
              <div className="flex items-center gap-2">
                {event?.isPaused ? <Pill tone="warn">Paused</Pill> : <Pill tone="good">Running</Pill>}
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <div className="flex items-stretch gap-2 min-w-max">
                {upcoming.map((u, idx) => {
                  const isNow = idx === 0;
                  const isNext = idx === 1;
                  return (
                    <div
                      key={u.overall}
                      className={cx(
                        "rounded-2xl border px-3 py-2 shadow-sm bg-background",
                        isNow && "border-emerald-300/70 bg-emerald-50/60 dark:bg-emerald-950/25",
                        isNext && "border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/20"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            "text-[10px] rounded-full border px-2 py-0.5 bg-muted",
                            isNow && "border-emerald-300/70 bg-emerald-100/60 dark:bg-emerald-950/30",
                            isNext && "border-amber-300/70 bg-amber-100/50 dark:bg-amber-950/30"
                          )}
                        >
                          #{u.overall}
                        </span>
                        {isNow ? <Pill tone="good">On clock</Pill> : isNext ? <Pill tone="warn">Next</Pill> : null}
                      </div>
                      <div className="mt-1 text-sm font-semibold truncate max-w-[220px]">
                        {u.team?.name ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        R{u.round} · P{u.pickInRound}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Picked big board + available players */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* BIG BOARD */}
        <div className="xl:col-span-8">
          <div className="rounded-3xl border bg-card shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Big Board (Picked)</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground">
                    Coaches draft from their Draft Boards — this screen is display-only.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone="neutral">{picks.length} picks</Pill>
                  <Pill tone="neutral">{teams.length} teams</Pill>
                </div>
              </div>
            </div>

            {/* Responsive tiles (no horizontal scroll) */}
            <div className="p-3 sm:p-4">
              {picks.length === 0 ? (
                <div className="rounded-2xl border bg-muted/30 p-8 text-center">
                  <div className="text-sm font-semibold">No picks yet</div>
                  <div className="mt-1 text-sm text-muted-foreground">This will fill in live as picks are made.</div>
                </div>
              ) : (
                <div
                  className={cx(
                    "grid gap-2 sm:gap-3",
                    "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  )}
                >
                  {picks.map((p) => {
                    const r = ratingFromRank(p.player.rank);
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl border bg-background shadow-sm p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] rounded-full border bg-muted px-2 py-0.5">
                              #{p.overallNumber}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {teamShort(p.team?.name ?? "")}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            R{p.round} · P{p.pickInRound}
                          </span>
                        </div>

                        <div className="mt-2">
                          <div className="font-semibold leading-snug line-clamp-2">
                            {p.player.fullName}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="text-[11px] text-muted-foreground truncate">
                              {p.team?.name ?? "—"}
                            </div>
                            <Stars value={r} size="sm" showEmpty={false} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 sm:px-5 py-3 border-t text-[11px] sm:text-xs text-muted-foreground">
              Showing star rating derived from player rank (when rank is present).
            </div>
          </div>
        </div>

        {/* AVAILABLE PLAYERS */}
        <div className="xl:col-span-4">
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Available Players</div>
                <div className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold">{filteredRemaining.length}</span> of{" "}
                  <span className="font-semibold">{remaining.length}</span>
                </div>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-44 rounded-md border px-3 text-sm"
              />
            </div>

            <div className="mt-3 rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold sticky top-0">
                <div className="col-span-8">Player</div>
                <div className="col-span-4 text-right">Rating</div>
              </div>

              {filteredRemaining.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">No matches.</div>
              ) : (
                <div className="divide-y max-h-[72vh] overflow-auto">
                  {filteredRemaining.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-12 gap-0 px-3 py-2 text-sm hover:bg-muted/40 transition"
                    >
                      <div className="col-span-8 font-semibold truncate">{p.fullName}</div>
                      <div className="col-span-4 flex items-center justify-end">
                        <Stars value={p.rating} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              This list is your eligible/undrafted pool.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
