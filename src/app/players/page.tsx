"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  formatPlayerHistoryNarrative,
  getPlayerHistory,
  type PlayerDraftHistoryEntry,
} from "@/lib/playerHistory";
import {
  PlayerHistoryProvider,
  usePlayerHistoryIndex,
} from "@/components/PlayerHistoryProvider";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";

type Player = {
  id: string;
  fullName: string;
  notes: string | null;
  experience: string | null;

  spring2026Rating: number | null;

  isGoalie?: boolean;

  isDrafted: boolean;
  draftedTeam: { name: string; order: number } | null;

  draftedAt?: string | null;
  drafted?: boolean;
  isDraftedAnyFlag?: boolean;
  eligible?: boolean;
  isEligible?: boolean;
  isDraftEligible?: boolean;
};

type SessionUser = { id?: string; role?: Role } | null;

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
          className={cx(
            "text-base leading-none",
            i < v ? "text-amber-500" : "text-muted-foreground/40"
          )}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function toNumberOrNull(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractSpring2026Rating(p: any): number | null {
  const n = toNumberOrNull(p?.spring2026Rating);
  if (n == null) return null;
  const t = Math.trunc(n);
  if (t < 1) return 1;
  if (t > 5) return 5;
  return t;
}

function extractGoalieFlag(p: any): boolean {
  if (typeof p?.isGoalie === "boolean") return p.isGoalie;
  if (typeof p?.goalie === "boolean") return p.goalie;
  if (typeof p?.isGK === "boolean") return p.isGK;
  if (typeof p?.gk === "boolean") return p.gk;
  return false;
}

function normalizePlayers(rows: any[]): Player[] {
  return (rows ?? []).map((p: any) => {
    const spring = extractSpring2026Rating(p);
    return {
      id: String(p.id),
      fullName: String(p.fullName ?? ""),
      notes: (p.notes ?? null) as string | null,
      experience: (p.experience ?? null) as string | null,

      spring2026Rating: spring,

      isGoalie: extractGoalieFlag(p),

      isDrafted: !!(p?.isDrafted ?? p?.drafted ?? p?.draftedAt),
      draftedTeam: (p?.draftedTeam ??
        (p?.team ? { name: p.team?.name, order: p.team?.order } : null) ??
        null) as any,
      draftedAt: p?.draftedAt ?? null,
      drafted: typeof p?.drafted === "boolean" ? p.drafted : undefined,
      isDraftedAnyFlag:
        typeof p?.isDrafted === "boolean" ? p.isDrafted : undefined,
      eligible: typeof p?.eligible === "boolean" ? p.eligible : undefined,
      isEligible: typeof p?.isEligible === "boolean" ? p.isEligible : undefined,
      isDraftEligible:
        typeof p?.isDraftEligible === "boolean" ? p.isDraftEligible : undefined,
    };
  });
}

function PlayersPageInner() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { index: historyIndex } = usePlayerHistoryIndex();

  const canSave = sessionUser?.role === "ADMIN";

  async function loadSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setSessionUser(json?.user ?? null);
    } catch {
      setSessionUser(null);
    }
  }

  async function loadPlayers() {
    setLoading(true);
    try {
      const res = await fetch("/api/draft/players?eligible=true", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.players) ? json.players : [];
      setPlayers(normalizePlayers(rows));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    loadPlayers();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    const list = s
      ? players.filter((p) => (p.fullName ?? "").toLowerCase().includes(s))
      : players;

    return [...list].sort((a, b) => {
      const ra = a.spring2026Rating;
      const rb = b.spring2026Rating;

      if (ra == null && rb == null) {
        return a.fullName.localeCompare(b.fullName);
      }
      if (ra == null) return 1;
      if (rb == null) return -1;
      if (rb !== ra) return rb - ra;

      return a.fullName.localeCompare(b.fullName);
    });
  }, [players, q]);

  function setField(id: string, patch: Partial<Player>) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }

  async function saveAll() {
    if (!canSave) return;
    setSavingAll(true);
    try {
      await fetch("/api/draft/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: players.map((p) => ({
            id: p.id,
            notes: p.notes ?? null,
            experience: (p.experience ?? "").toString(),
            spring2026Rating: p.spring2026Rating ?? null,
            isGoalie: !!p.isGoalie,
          })),
        }),
      });
      await loadPlayers();
    } finally {
      setSavingAll(false);
    }
  }

  function historyFor(p: Player): PlayerDraftHistoryEntry[] {
    return getPlayerHistory(historyIndex, p.fullName);
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Full Eligible Players
        </h1>
        <div className="text-sm text-muted-foreground">
          Players born 12/01/2012 – 12/31/2016 with U13 selected.
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player..."
          className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        />
        <button
          onClick={loadPlayers}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Player</div>
          <div className="col-span-2">Rating (Spring 2026)</div>
          <div className="col-span-1">{canSave ? "Goalie" : ""}</div>
          <div className="col-span-5">Parent&apos;s Comment</div>
          <div className="col-span-1 flex justify-end">
            {canSave ? (
              <button
                type="button"
                onClick={saveAll}
                disabled={savingAll}
                className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
              >
                {savingAll ? "Saving…" : "Save All"}
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            No eligible players found.
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => {
              const expanded = expandedId === p.id;
              const h = historyFor(p);

              const narrative = h.length
                ? formatPlayerHistoryNarrative({
                    playerFullName: p.fullName,
                    history: h,
                    ratings: {},
                  })
                : "";

              const parentComment =
                (p.notes ?? "").trim() || (p.experience ?? "").trim();

              return (
                <div key={p.id}>
                  <div
                    className={cx(
                      "grid grid-cols-12 gap-0 px-3 py-3 text-sm items-center",
                      p.isGoalie ? "bg-sky-50" : undefined
                    )}
                  >
                    <div className="col-span-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((cur) => (cur === p.id ? null : p.id))
                        }
                        className="font-semibold hover:underline text-left"
                      >
                        {p.fullName}
                      </button>
                    </div>

                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <Stars value={p.spring2026Rating ?? null} />
                        {canSave ? (
                          <input
                            type="number"
                            min={1}
                            max={5}
                            step={1}
                            value={p.spring2026Rating ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const n = raw === "" ? null : Number(raw);
                              setField(p.id, {
                                spring2026Rating: Number.isFinite(n as any)
                                  ? (n as number | null)
                                  : null,
                              });
                            }}
                            className="w-16 rounded-md border px-2 py-1 text-sm"
                            aria-label="Rating (1-5)"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-1">
                      {canSave ? (
                        <label className="inline-flex items-center gap-2 text-xs select-none">
                          <input
                            type="checkbox"
                            checked={!!p.isGoalie}
                            onChange={(e) =>
                              setField(p.id, { isGoalie: e.target.checked })
                            }
                            className="h-4 w-4"
                            aria-label="Goalie"
                          />
                          <span className="text-muted-foreground">GK</span>
                        </label>
                      ) : (
                        <span className="text-xs text-muted-foreground"></span>
                      )}
                    </div>

                    <div className="col-span-5">
                      <div className="text-muted-foreground whitespace-pre-wrap break-words">
                        {parentComment}
                      </div>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <span className="text-xs text-muted-foreground"></span>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="px-3 pb-4">
                      <div className="rounded-lg border bg-background p-3 text-sm">
                        <div className="font-semibold">
                          Previous Draft History
                        </div>

                        {h.length ? (
                          <>
                            {narrative ? (
                              <div className="mt-1 text-muted-foreground">
                                {narrative}
                              </div>
                            ) : null}
                            <div className="mt-3 grid gap-2">
                              {h.map((e, idx) => (
                                <div
                                  key={`${e.season}-${e.year}-${e.overallPick}-${idx}`}
                                  className="text-muted-foreground"
                                >
                                  {e.year} {e.seasonLabel}: drafted{" "}
                                  {e.overallPick} overall (Round {e.round},
                                  Pick {e.pickInRound}) by {e.teamName}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-muted-foreground">
                            No prior draft history found.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayersPage() {
  return (
    <PlayerHistoryProvider>
      <PlayersPageInner />
    </PlayerHistoryProvider>
  );
}
