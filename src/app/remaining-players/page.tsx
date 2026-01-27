"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  formatPlayerHistoryNarrative,
  getPlayerHistory,
  type PlayerDraftHistoryEntry,
} from "@/lib/playerHistory";
import { PlayerHistoryProvider, usePlayerHistoryIndex } from "@/components/PlayerHistoryProvider";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";

type Player = {
  id: string;
  fullName: string;
  notes: string | null;
  experience: string | null;
  fall2025Rating: number | null;

  draftedAt?: string | null;
  drafted?: boolean;
  isDrafted?: boolean;

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

function extractFallRating(p: any): number | null {
  const candidates = [
    p?.fall2025Rating,
    p?.rating,
    p?.boardRating,
    p?.playerRating,
    p?.ratingValue,
    p?.ratingStars,
    p?.stars,
    p?.ratingFall2025,
    p?.fallRating,
  ];
  for (const c of candidates) {
    const n = toNumberOrNull(c);
    if (n != null) return n;
  }
  return null;
}

function isDraftedAny(p: any): boolean {
  return !!(p?.draftedAt ?? p?.isDrafted ?? p?.drafted);
}

function isEligibleAny(p: any): boolean {
  if (typeof p?.isDraftEligible === "boolean") return p.isDraftEligible;
  if (typeof p?.eligible === "boolean") return p.eligible;
  if (typeof p?.isEligible === "boolean") return p.isEligible;
  return true;
}

function stableHash(players: any[]) {
  try {
    return JSON.stringify(
      (players ?? []).map((p) => ({
        id: p.id,
        fullName: p.fullName,
        experience: p.experience ?? null,
        fall2025Rating: p.fall2025Rating ?? p.rating ?? null,
        notes: p.notes ?? null,
        drafted: !!(p.draftedAt ?? p.isDrafted ?? p.drafted),
        eligible:
          typeof p.isDraftEligible === "boolean"
            ? p.isDraftEligible
            : typeof p.eligible === "boolean"
            ? p.eligible
            : typeof p.isEligible === "boolean"
            ? p.isEligible
            : null,
      }))
    );
  } catch {
    return String(Date.now());
  }
}

function RemainingPlayersInner() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { index: historyIndex } = usePlayerHistoryIndex();

  const lastHashRef = useRef<string>("");
  const hasLoadedOnceRef = useRef(false);

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

  async function loadPlayers(silent?: boolean) {
    if (!silent) setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/draft/players?eligible=true&drafted=false", {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      const raw = Array.isArray(json?.players) ? json.players : [];

      const eligibleOnly = raw
        .filter((p: any) => !isDraftedAny(p))
        .filter((p: any) => isEligibleAny(p));

      const nextPlayers: Player[] = eligibleOnly.map((p: any) => ({
        id: String(p.id),
        fullName: String(p.fullName ?? ""),
        notes: (p.notes ?? null) as string | null,
        experience: (p.experience ?? null) as string | null,
        fall2025Rating: extractFallRating(p),
        draftedAt: p.draftedAt ?? null,
        drafted: !!p.drafted,
        isDrafted: !!p.isDrafted,
        eligible: typeof p.eligible === "boolean" ? p.eligible : undefined,
        isEligible: typeof p.isEligible === "boolean" ? p.isEligible : undefined,
        isDraftEligible: typeof p.isDraftEligible === "boolean" ? p.isDraftEligible : undefined,
      }));

      const nextHash = stableHash(nextPlayers);

      if (nextHash !== lastHashRef.current) {
        lastHashRef.current = nextHash;
        setPlayers(nextPlayers);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load remaining players");
      setPlayers([]);
    } finally {
      if (!silent) setLoading(false);
      if (!hasLoadedOnceRef.current) {
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadSession();
    loadPlayers(false);
    const t = setInterval(() => loadPlayers(true), 2000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => (p.fullName ?? "").toLowerCase().includes(s));
  }, [players, q]);

  function setField(id: string, patch: Partial<Player>) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function saveRow(p: Player) {
    if (!canSave) return;
    setSavingId(p.id);
    try {
      const res = await fetch("/api/draft/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: [
            {
              id: p.id,
              rank: null,
              notes: p.notes ?? null,
              experience: (p.experience ?? "").toString(),
              fall2025Rating: p.fall2025Rating ?? null,
              spring2025Rating: null,
            },
          ],
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Save failed");
      }

      await loadPlayers(true);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  function historyFor(p: Player): PlayerDraftHistoryEntry[] {
    return getPlayerHistory(historyIndex, p.fullName);
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Eligible Players</h1>
        <div className="text-sm text-muted-foreground">Only eligible + undrafted. Auto-updates during the live draft.</div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player..."
          className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        />
        <button onClick={() => loadPlayers(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      {err ? <div className="mt-4 text-sm text-rose-600">{err}</div> : null}

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Player</div>
          <div className="col-span-2">Rating</div>
          <div className="col-span-6">Parent&apos;s Comment</div>
          <div className="col-span-1 text-right">Save</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No eligible remaining players.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((p) => {
              const expanded = expandedId === p.id;
              const h = historyFor(p);

              const narrative = h.length
                ? formatPlayerHistoryNarrative({
                    playerFullName: p.fullName,
                    history: h,
                    ratings: { fall2025: p.fall2025Rating ?? null },
                  })
                : "";

              const parentComment = (p.notes ?? "").trim() || (p.experience ?? "").trim();

              return (
                <div key={p.id}>
                  <div className="grid grid-cols-12 gap-0 px-3 py-3 text-sm items-center">
                    <div className="col-span-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                        className="font-semibold hover:underline text-left"
                      >
                        {p.fullName}
                      </button>
                    </div>

                    <div className="col-span-2">
                      <div className="flex items-center gap-2">
                        <Stars value={p.fall2025Rating} />
                        {canSave ? (
                          <input
                            type="number"
                            min={0}
                            max={5}
                            step={1}
                            value={p.fall2025Rating ?? ""}
                            onChange={(e) =>
                              setField(p.id, {
                                fall2025Rating: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className="w-16 rounded-md border px-2 py-1 text-sm"
                            aria-label="Rating (0-5)"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-6">
                      <div className="text-muted-foreground whitespace-pre-wrap break-words">{parentComment}</div>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {canSave ? (
                        <button
                          onClick={() => saveRow(p)}
                          disabled={savingId === p.id}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                        >
                          {savingId === p.id ? "Saving…" : "Save"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground"></span>
                      )}
                    </div>
                  </div>

                  {expanded ? (
                    <div className="px-3 pb-4">
                      <div className="rounded-lg border bg-background p-3 text-sm">
                        <div className="font-semibold">Previous Draft History</div>

                        {h.length ? (
                          <>
                            {narrative ? <div className="mt-1 text-muted-foreground">{narrative}</div> : null}
                            <div className="mt-3 grid gap-2">
                              {h.map((e, idx) => (
                                <div key={`${e.season}-${e.year}-${e.overallPick}-${idx}`} className="text-muted-foreground">
                                  {e.year} {e.seasonLabel}: drafted {e.overallPick} overall (Round {e.round}, Pick{" "}
                                  {e.pickInRound}) by {e.teamName}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-muted-foreground">No prior draft history found.</div>
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

export default function RemainingPlayersPage() {
  return (
    <PlayerHistoryProvider>
      <RemainingPlayersInner />
    </PlayerHistoryProvider>
  );
}
