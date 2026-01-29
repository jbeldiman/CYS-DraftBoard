"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Team = {
  id: string;
  name: string;
  order: number;
  coachUserId: string | null;
  coachUser?: { id: string; name: string | null; email: string | null } | null;
};

type RosterPlayer = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  round: number | null;
};

type TradeItem = {
  side: "FROM_GIVES" | "TO_GIVES";
  player: { id: string; fullName: string };
};

type Trade = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "COUNTERED" | "CANCELLED";
  fromTeamId: string;
  toTeamId: string;
  fromAvgRound: number | null;
  toAvgRound: number | null;
  roundDelta: number | null;
  message: string | null;
  parentTradeId: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
  fromTeam: { id: string; name: string };
  toTeam: { id: string; name: string };
  items: TradeItem[];
};

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

export default function TradeHubPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeam, setMyTeam] = useState<{ id: string; name: string; order: number } | null>(null);
  const [myRoster, setMyRoster] = useState<RosterPlayer[]>([]);
  const [partnerTeamId, setPartnerTeamId] = useState<string>("");
  const [partnerRoster, setPartnerRoster] = useState<RosterPlayer[]>([]);
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const [inbox, setInbox] = useState<Trade[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  const lastToastRef = useRef<string>("");

  async function loadContext() {
    setLoading(true);
    const r = await fetch("/api/trades/context", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "Failed to load context");

    setRole(j.role ?? null);
    setTeams(j.teams ?? []);
    setMyTeam(j.myTeam ?? null);
    setMyRoster(j.myRoster ?? []);
    setLoading(false);
  }

  async function loadPartner(teamId: string) {
    setPartnerRoster([]);
    setGiveIds([]);
    setReceiveIds([]);
    if (!teamId) return;

    const r = await fetch(`/api/trades/partner/${teamId}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "Failed to load partner roster");
    setPartnerRoster(j.players ?? []);
  }

  async function loadInbox(showToast: boolean) {
    const r = await fetch("/api/trades/inbox", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return;

    setMyTeamId(j.myTeamId ?? null);
    const trades: Trade[] = j.trades ?? [];
    setInbox(trades);

    if (showToast && trades.length) {
      const top = trades[0];
      const toastKey = `${top.id}:${top.status}:${top.updatedAt}`;
      if (toastKey !== lastToastRef.current) {
        lastToastRef.current = toastKey;

       
        if (role === "COACH" && (top.status === "PENDING" || top.status === "ACCEPTED" || top.status === "REJECTED" || top.status === "COUNTERED")) {
          
          alert(
            top.status === "PENDING"
              ? "New trade proposal received."
              : top.status === "ACCEPTED"
              ? "A trade has been accepted."
              : top.status === "REJECTED"
              ? "A trade has been rejected."
              : "A trade has been countered."
          );
        }
      }
    }
  }

  useEffect(() => {
    loadContext()
      .then(() => loadInbox(false))
      .catch((e) => {
  
        alert(e?.message ?? "Failed to load trade hub");
        setLoading(false);
      });
 
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      loadInbox(true).catch(() => null);
    }, 5000);
    return () => window.clearInterval(t);
   
  }, [role]);

  const myRoundById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of myRoster) if (typeof p.round === "number") m.set(p.id, p.round);
    return m;
  }, [myRoster]);

  const partnerRoundById = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of partnerRoster) if (typeof p.round === "number") m.set(p.id, p.round);
    return m;
  }, [partnerRoster]);

  const fairness = useMemo(() => {
    const giveRounds = giveIds.map((id) => myRoundById.get(id)).filter((v): v is number => typeof v === "number");
    const receiveRounds = receiveIds.map((id) => partnerRoundById.get(id)).filter((v): v is number => typeof v === "number");
    const giveAvg = avg(giveRounds);
    const receiveAvg = avg(receiveRounds);
    const delta = giveAvg == null || receiveAvg == null ? null : Math.abs(giveAvg - receiveAvg);
    const ok = delta != null && delta <= 2;
    return { giveAvg, receiveAvg, delta, ok };
  }, [giveIds, receiveIds, myRoundById, partnerRoundById]);

  const canPropose = role !== "PARENT" && !!myTeam?.id && !!partnerTeamId && giveIds.length > 0 && receiveIds.length > 0 && fairness.ok;

  async function proposeTrade() {
    if (!canPropose) return;

    const r = await fetch("/api/trades/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toTeamId: partnerTeamId,
        givePlayerIds: giveIds,
        receivePlayerIds: receiveIds,
        message: message.trim() ? message.trim() : null,
      }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
  
      alert(j?.error ?? "Failed to propose trade");
      return;
    }

    setGiveIds([]);
    setReceiveIds([]);
    setMessage("");
    await loadInbox(false);
  
    alert("Trade proposed.");
  }

  function tradeTitle(t: Trade) {
    return `${t.fromTeam.name} → ${t.toTeam.name}`;
  }

  function tradePlayers(t: Trade) {
    const fromGives = t.items.filter((i) => i.side === "FROM_GIVES").map((i) => i.player.fullName);
    const toGives = t.items.filter((i) => i.side === "TO_GIVES").map((i) => i.player.fullName);
    return { fromGives, toGives };
  }

  const incomingTrades = useMemo(() => {
    if (role !== "COACH" || !myTeamId) return [];
    return inbox.filter((t) => t.status === "PENDING" && t.toTeamId === myTeamId);
  }, [inbox, myTeamId, role]);

  const myOutgoingPending = useMemo(() => {
    if (role !== "COACH" || !myTeamId) return [];
    return inbox.filter((t) => t.status === "PENDING" && t.fromTeamId === myTeamId);
  }, [inbox, myTeamId, role]);

  async function respond(tradeId: string, action: "ACCEPT" | "REJECT", payload?: any) {
    const r = await fetch(`/api/trades/${tradeId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(payload ?? {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      
      alert(j?.error ?? "Failed");
      return;
    }
    await loadInbox(false);
  }

  async function counter(tradeId: string, counterPartnerTeamId: string, counterFromRoster: RosterPlayer[], counterToRoster: RosterPlayer[]) {
    
    const fromNames = counterFromRoster.map((p) => p.fullName).join("\n");
    const toNames = counterToRoster.map((p) => p.fullName).join("\n");

  
    const giveCsv = prompt(`COUNTER: Enter players YOU GIVE (exact names, comma-separated):\n\n${fromNames}`);
    if (!giveCsv) return;

    
    const receiveCsv = prompt(`COUNTER: Enter players YOU RECEIVE (exact names, comma-separated):\n\n${toNames}`);
    if (!receiveCsv) return;

    const giveNames = giveCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const receiveNames = receiveCsv.split(",").map((s) => s.trim()).filter(Boolean);

    const giveIds = counterFromRoster.filter((p) => giveNames.includes(p.fullName)).map((p) => p.id);
    const receiveIds = counterToRoster.filter((p) => receiveNames.includes(p.fullName)).map((p) => p.id);

    if (!giveIds.length || !receiveIds.length) {
   
      alert("Could not match one or more names. Try again.");
      return;
    }

    const r = await fetch(`/api/trades/${tradeId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "COUNTER", givePlayerIds: giveIds, receivePlayerIds: receiveIds }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
     
      alert(j?.error ?? "Failed to counter");
      return;
    }
    await loadInbox(false);
    
    alert("Counter proposed.");
  }

  const partnerTeams = useMemo(() => {
    if (!myTeam?.id) return teams;
    return teams.filter((t) => t.id !== myTeam.id);
  }, [teams, myTeam]);

  if (loading) {
    return <div className="p-6 text-sm text-neutral-600">Loading Trade Hub…</div>;
  }

  if (role !== "COACH" && role !== "ADMIN" && role !== "BOARD") {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-lg font-semibold">Trade Hub</div>
          <div className="mt-2 text-sm text-neutral-600">You don’t have access to trades.</div>
          <div className="mt-4">
            <Link className="text-sm underline" href="/draft">
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (role === "COACH" && !myTeam?.id) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-lg font-semibold">Trade Hub</div>
          <div className="mt-2 text-sm text-neutral-600">No team assigned to your coach account yet.</div>
          <div className="mt-4">
            <Link className="text-sm underline" href="/draft">
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-2xl font-semibold">Trade Hub</div>
            <div className="text-sm text-neutral-600">
              Fairness rule: average draft round difference must be ≤ 2.
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">
              Home
            </Link>
            <Link href="/rosters" className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">
              Rosters
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Propose */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Propose a Trade</div>
                {myTeam ? (
                  <div className="text-xs text-neutral-500">
                    You: <span className="font-medium text-neutral-700">{myTeam.name}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-1 font-medium">Trade partner</div>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={partnerTeamId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPartnerTeamId(id);
                      loadPartner(id).catch((err) => alert(err?.message ?? "Failed to load partner"));
                    }}
                  >
                    <option value="">Select a team…</option>
                    {partnerTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.order}. {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <div className="mb-1 font-medium">Message (optional)</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Short note..."
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-neutral-50 p-3">
                  <div className="text-sm font-semibold">Players you give</div>
                  <div className="mt-2 max-h-64 overflow-auto">
                    {myRoster.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={giveIds.includes(p.id)}
                          onChange={(e) => {
                            setGiveIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)));
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                        <span className="shrink-0 rounded-lg border bg-white px-2 py-0.5 text-xs text-neutral-600">
                          Rd {p.round ?? "—"}
                        </span>
                      </label>
                    ))}
                    {!myRoster.length ? <div className="text-xs text-neutral-500">No roster yet.</div> : null}
                  </div>
                </div>

                <div className="rounded-2xl border bg-neutral-50 p-3">
                  <div className="text-sm font-semibold">Players you receive</div>
                  <div className="mt-2 max-h-64 overflow-auto">
                    {partnerRoster.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={receiveIds.includes(p.id)}
                          onChange={(e) => {
                            setReceiveIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)));
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                        <span className="shrink-0 rounded-lg border bg-white px-2 py-0.5 text-xs text-neutral-600">
                          Rd {p.round ?? "—"}
                        </span>
                      </label>
                    ))}
                    {!partnerTeamId ? <div className="text-xs text-neutral-500">Pick a partner team first.</div> : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-neutral-700">
                  <div>
                    Your avg:{" "}
                    <span className="font-semibold">{fairness.giveAvg == null ? "—" : fairness.giveAvg.toFixed(2)}</span>
                    {" • "}
                    Their avg:{" "}
                    <span className="font-semibold">{fairness.receiveAvg == null ? "—" : fairness.receiveAvg.toFixed(2)}</span>
                    {" • "}
                    Δ: <span className={cx("font-semibold", fairness.delta != null && fairness.delta > 2 && "text-red-600")}>
                      {fairness.delta == null ? "—" : fairness.delta.toFixed(2)}
                    </span>
                  </div>
                  {fairness.delta != null && fairness.delta > 2 ? (
                    <div className="text-xs text-red-600">Not allowed: averages must be within 2 rounds.</div>
                  ) : null}
                </div>

                <button
                  className={cx(
                    "rounded-xl px-4 py-2 text-sm font-semibold",
                    canPropose ? "bg-black text-white hover:bg-black/90" : "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                  )}
                  onClick={proposeTrade}
                  disabled={!canPropose}
                >
                  Propose Trade
                </button>
              </div>
            </div>
          </div>

          {/* Inbox */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border bg-white p-4 sm:p-5">
              <div className="text-lg font-semibold">Incoming</div>
              <div className="mt-1 text-xs text-neutral-500">Auto-refreshes every 5 seconds.</div>

              <div className="mt-3 space-y-3">
                {incomingTrades.map((t) => {
                  const { fromGives, toGives } = tradePlayers(t);
                  return (
                    <div key={t.id} className="rounded-2xl border bg-neutral-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{tradeTitle(t)}</div>
                          <div className="mt-1 text-xs text-neutral-600">
                            Avg: {t.fromAvgRound?.toFixed(2) ?? "—"} vs {t.toAvgRound?.toFixed(2) ?? "—"} (Δ {t.roundDelta?.toFixed(2) ?? "—"})
                          </div>
                          {t.message ? <div className="mt-1 text-xs text-neutral-700">“{t.message}”</div> : null}
                        </div>
                        <span className="rounded-lg border bg-white px-2 py-0.5 text-xs text-neutral-600">PENDING</span>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold text-neutral-700">They give</div>
                          <ul className="mt-1 list-disc pl-4 text-xs text-neutral-700">
                            {fromGives.map((n) => (
                              <li key={n}>{n}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-neutral-700">You give</div>
                          <ul className="mt-1 list-disc pl-4 text-xs text-neutral-700">
                            {toGives.map((n) => (
                              <li key={n}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/90"
                          onClick={() => respond(t.id, "ACCEPT")}
                        >
                          Accept
                        </button>
                        <button
                          className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-100"
                          onClick={() => respond(t.id, "REJECT")}
                        >
                          Reject
                        </button>
                        <button
                          className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-100"
                          onClick={() => counter(t.id, t.fromTeamId, myRoster, partnerRoster)}
                        >
                          Counter
                        </button>
                      </div>
                    </div>
                  );
                })}

                {!incomingTrades.length ? (
                  <div className="rounded-2xl border bg-neutral-50 p-3 text-sm text-neutral-600">
                    No pending incoming trades.
                  </div>
                ) : null}
              </div>

              {/* Outgoing */}
              {role === "COACH" ? (
                <>
                  <div className="mt-6 text-lg font-semibold">Your pending outgoing</div>
                  <div className="mt-3 space-y-3">
                    {myOutgoingPending.map((t) => (
                      <div key={t.id} className="rounded-2xl border bg-white p-3">
                        <div className="text-sm font-semibold">{tradeTitle(t)}</div>
                        <div className="mt-1 text-xs text-neutral-600">
                          Avg: {t.fromAvgRound?.toFixed(2) ?? "—"} vs {t.toAvgRound?.toFixed(2) ?? "—"} (Δ {t.roundDelta?.toFixed(2) ?? "—"})
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">Waiting for response…</div>
                      </div>
                    ))}
                    {!myOutgoingPending.length ? (
                      <div className="rounded-2xl border bg-neutral-50 p-3 text-sm text-neutral-600">
                        No pending outgoing trades.
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            {/* Recent history */}
            <div className="mt-4 rounded-2xl border bg-white p-4 sm:p-5">
              <div className="text-lg font-semibold">Recent activity</div>
              <div className="mt-3 space-y-2">
                {inbox.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border bg-neutral-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{tradeTitle(t)}</div>
                      <div className="text-xs text-neutral-600">
                        Δ {t.roundDelta?.toFixed(2) ?? "—"} • {new Date(t.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg border bg-white px-2 py-0.5 text-xs text-neutral-700">
                      {t.status}
                    </span>
                  </div>
                ))}
                {!inbox.length ? (
                  <div className="rounded-2xl border bg-neutral-50 p-3 text-sm text-neutral-600">No trade history yet.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-neutral-500">
          Note: Trades use polling (no websockets). If you want true real-time popups without alerts, we can add a toast component next.
        </div>
      </div>
    </div>
  );
}
