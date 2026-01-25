"use client";

import React, { useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";
type SessionUser = { id?: string; role?: Role } | null;

type SiblingRow = {
  registrantName: string;
  leagueChoice: string;
  playerId: string;
  playerName: string;
  siblingNames: string; 
  draftCost: string; 
};

type SiblingsResponse = {
  draftEventId: string;
  rows: SiblingRow[];
};

export default function SiblingsPage() {
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SiblingRow[]>([]);
  const [costEdits, setCostEdits] = useState<Record<string, string>>({});

  const canSave = sessionUser?.role === "ADMIN";

  async function loadSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = await res.json();
      setSessionUser(json?.user ?? null);
    } catch {
      setSessionUser(null);
    }
  }

  async function loadRows() {
    setLoading(true);
    try {
      const res = await fetch("/api/draft/siblings", { cache: "no-store" });
      const json = (await res.json()) as SiblingsResponse;
      const nextRows = Array.isArray(json?.rows) ? json.rows : [];
      setRows(nextRows);

      const nextEdits: Record<string, string> = {};
      for (const r of nextRows) nextEdits[r.playerId] = r.draftCost ?? "";
      setCostEdits(nextEdits);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        (r.registrantName ?? "").toLowerCase().includes(s) ||
        (r.playerName ?? "").toLowerCase().includes(s) ||
        (r.siblingNames ?? "").toLowerCase().includes(s) ||
        (r.leagueChoice ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  function setCostEdit(playerId: string, value: string) {
    setCostEdits((prev) => ({ ...prev, [playerId]: value }));
  }

  async function saveCost(playerId: string) {
    if (!canSave) return;

    setSavingId(playerId);
    try {
      const draftCost = (costEdits[playerId] ?? "").trim();

      await fetch("/api/draft/admin/siblings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, draftCost }),
      });

      await loadRows();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Siblings</h1>
        <div className="text-sm text-muted-foreground">
          Shows U13 draft-eligible siblings registered by the same parent and in the same league.
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by parent, player, sibling, or league..."
          className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        />
        <button onClick={loadRows} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-3">Registrant</div>
          <div className="col-span-2">League</div>
          <div className="col-span-3">Player Name</div>
          <div className="col-span-3">Sibling(s)</div>
          <div className="col-span-1 text-right">Draft Cost</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No sibling rows found.</div>
        ) : (
          <div className="divide-y">
            {filteredRows.map((r) => {
              const edit = costEdits[r.playerId] ?? "";
              const isSaving = savingId === r.playerId;

              return (
                <div key={r.playerId} className="grid grid-cols-12 gap-0 items-center px-3 py-2">
                  <div className="col-span-3 text-sm font-semibold break-words">
                    {r.registrantName || "Unknown"}
                  </div>
                  <div className="col-span-2 text-sm">{r.leagueChoice || ""}</div>
                  <div className="col-span-3 text-sm">{r.playerName}</div>
                  <div className="col-span-3 text-sm text-muted-foreground">{r.siblingNames}</div>

                  <div className="col-span-1 flex justify-end gap-2">
                    {canSave ? (
                      <>
                        <input
                          value={edit}
                          onChange={(e) => setCostEdit(r.playerId, e.target.value)}
                          placeholder="e.g. Next Pick"
                          className="w-28 rounded-md border px-2 py-1 text-sm text-right"
                        />
                        <button
                          onClick={() => saveCost(r.playerId)}
                          disabled={isSaving}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                        >
                          {isSaving ? "Saving…" : "Save"}
                        </button>
                      </>
                    ) : (
                      <div className="text-sm text-right">{r.draftCost ?? ""}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
