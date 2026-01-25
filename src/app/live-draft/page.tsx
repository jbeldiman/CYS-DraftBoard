"use client";

import React, { useEffect, useMemo, useState } from "react";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs shadow-sm",
        tone === "good" && "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:border-emerald-900/40",
        tone === "warn" && "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-900/40",
        tone === "neutral" && "bg-card text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

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
  teams: {
    id: string;
    name: string;
    order: number;
  }[];
  recentPicks: {
    id: string;
    overallNumber: number;
    round: number;
    pickInRound: number;
    madeAt: string;
    team: { id: string; name: string; order: number };
    player: { id: string; fullName: string; rank: number | null };
  }[];
  counts: { undrafted: number; drafted: number };
};

type RemainingPlayer = {
  id: string;
  fullName: string;
  jerseySize: string | null;
};

export default function LiveDraftPage() {
  const fallbackScheduledTarget = useMemo(() => new Date(Date.UTC(2026, 1, 16, 23, 0, 0)), []);
  const [now, setNow] = useState(() => new Date());

  const [state, setState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
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

  async function loadRemaining() {
    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setRemaining(
        (json.players ?? []).map((p: any) => ({ id: p.id, fullName: p.fullName, jerseySize: p.jerseySize ?? null }))
      );
    } catch {
      setRemaining([]);
    }
  }

  useEffect(() => {
    loadState();
    loadRemaining();
    const t = setInterval(() => {
      loadState();
      loadRemaining();
    }, 2000);
    return () => clearInterval(t);
  }, []);

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

    if (event.isPaused) {
      const remaining = event.pauseRemainingSecs ?? event.pickClockSeconds;
      return { remaining };
    }

    if (!event.clockEndsAt) return { remaining: null };

    const endsAt = new Date(event.clockEndsAt);
    const remaining = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
    return { remaining };
  }, [event, now]);

  const liveRemaining = liveClock.remaining;
  const liveTotalSeconds = liveRemaining ?? 0;
  const liveMin = Math.floor(liveTotalSeconds / 60);
  const liveSec = liveTotalSeconds % 60;

  const teams = state?.teams ?? [];
  const picks = state?.recentPicks ?? [];

  const expectedIndex = useMemo(() => {
    const cur = event?.currentPick ?? 1;
    const len = Math.max(1, teams.length);
    return (cur - 1) % len;
  }, [event?.currentPick, teams.length]);

  const onClockTeam = teams.length ? teams[expectedIndex] : null;

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

  // ─────────────────────────────────────────────────────────────
  // NOT LIVE: countdown screen (make it feel like an event page)
  // ─────────────────────────────────────────────────────────────
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
              <Pill tone="neutral">Remaining: {state?.counts?.undrafted ?? 0}</Pill>
              <Pill tone="neutral">Drafted: {state?.counts?.drafted ?? 0}</Pill>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // LIVE: dashboard
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="py-2">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Live Draft Board</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {event?.name ?? "CYS Draft"} · Scheduled: {scheduledLabel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {event?.isPaused ? (
              <Pill tone="warn">⏸ Paused</Pill>
            ) : (
              <Pill tone="good">● Live</Pill>
            )}
            <Pill tone="neutral">Pick #{event?.currentPick ?? 1}</Pill>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">Drafted</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{state?.counts?.drafted ?? 0}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">Remaining</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{state?.counts?.undrafted ?? remaining.length}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">On the clock</div>
            <div className="mt-1 text-sm font-semibold truncate">{onClockTeam?.name ?? "—"}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">Pick clock</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {pad2(liveMin)}:{pad2(liveSec)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* LEFT: clock + recent picks */}
        <div className="xl:col-span-7 space-y-4">
          {/* Clock hero */}
          <div
            className={cx(
              "rounded-2xl border p-6 shadow-sm",
              event?.isPaused
                ? "bg-amber-50/60 dark:bg-amber-950/20"
                : "bg-emerald-50/60 dark:bg-emerald-950/20"
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Pick Clock</div>
                <div className="mt-1 text-6xl font-bold tabular-nums tracking-tight">
                  {pad2(liveMin)}:{pad2(liveSec)}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {event?.isPaused ? "Paused — clock held" : "Time remaining for the current pick"}
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-end gap-2">
                <Pill tone={event?.isPaused ? "warn" : "good"}>
                  {event?.isPaused ? "⏸ Paused" : "● Live"}
                </Pill>
                <div className="text-sm text-muted-foreground">Pick #{event?.currentPick ?? 1}</div>
              </div>
            </div>
          </div>

          {/* Recent picks */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Recent Picks</div>
                <div className="text-xs text-muted-foreground">Latest selections as they come in</div>
              </div>
              <Pill tone="neutral">{picks.length} shown</Pill>
            </div>

            <div className="mt-3 divide-y">
              {picks.length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">No picks yet.</div>
              ) : (
                picks.map((p) => (
                  <div key={p.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs rounded-full border bg-muted px-2 py-0.5">
                          #{p.overallNumber}
                        </span>
                        <div className="font-semibold truncate">{p.team.name}</div>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground truncate">
                        {p.player.fullName}
                        {p.player.rank !== null ? ` · Rank ${p.player.rank}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      R{p.round} · P{p.pickInRound}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: remaining + team order */}
        <div className="xl:col-span-5 space-y-4">
          {/* On clock */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">On the clock</div>
                <div className="mt-1 text-xl font-semibold">{onClockTeam?.name ?? "—"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Next pick: <span className="font-semibold">#{event?.currentPick ?? 1}</span>
                </div>
              </div>
              {!event?.isPaused ? <Pill tone="good">● Live</Pill> : <Pill tone="warn">⏸ Paused</Pill>}
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold">Team Order</div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {teams.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No teams configured yet.</div>
                ) : (
                  teams.map((t, idx) => {
                    const onClock = onClockTeam?.id === t.id && !event?.isPaused;
                    return (
                      <div
                        key={t.id}
                        className={cx(
                          "rounded-xl border px-3 py-2 transition",
                          onClock ? "bg-accent/60 border-accent shadow-sm" : "bg-background hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              {t.order}. {t.name}
                            </div>
                          </div>
                          {onClock ? <Pill tone="good">On the clock</Pill> : idx === expectedIndex ? <Pill tone="neutral">Up next</Pill> : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Remaining players */}
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Remaining Players</div>
                <div className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold">{filteredRemaining.length}</span> of{" "}
                  <span className="font-semibold">{remaining.length}</span>
                </div>
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-40 rounded-md border px-3 text-sm"
              />
            </div>

            <div className="mt-3 rounded-xl border overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold sticky top-0">
                <div className="col-span-9">Player</div>
                <div className="col-span-3">Jersey</div>
              </div>

              {filteredRemaining.length === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">No matches.</div>
              ) : (
                <div className="divide-y max-h-[420px] overflow-auto">
                  {filteredRemaining.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-12 gap-0 px-3 py-2 text-sm hover:bg-muted/40 transition"
                    >
                      <div className="col-span-9 font-semibold truncate">{p.fullName}</div>
                      <div className="col-span-3 text-muted-foreground">{p.jerseySize ?? ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
