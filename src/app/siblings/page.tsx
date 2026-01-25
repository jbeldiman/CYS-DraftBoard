"use client";

import React, { useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "BOARD" | "COACH" | "PARENT";

type SessionUser = { id?: string; role?: Role } | null;

type SiblingPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
};

type SiblingGroup = {
  groupKey: string;
  draftCost: number | null;
  players: SiblingPlayer[];
};

type SiblingsResponse = {
  draftEventId: string;
  groups: SiblingGroup[];
};

export default function SiblingsPage() {
  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SiblingGroup[]>([]);
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

  async function loadGroups() {
    setLoading(true);
    try {
      const res = await fetch("/api/draft/siblings", { cache: "no-store" });
      const json = (await res.json()) as SiblingsResponse;
      const nextGroups = Array.isArray(json?.groups) ? json.groups : [];
      setGroups(nextGroups);

      const nextEdits: Record<string, string> = {};
      for (const g of nextGroups) {
        nextEdits[g.groupKey] = g.draftCost === null || g.draftCost === undefined ? "" : String(g.draftCost);
      }
      setCostEdits(nextEdits);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
    loadGroups();
  }, []);

  const filteredGroups = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups.filter((g) => {
      const key = (g.groupKey ?? "").toLowerCase();
      if (key.includes(s)) return true;
      return (g.players ?? []).some((p) => (p.fullName ?? "").toLowerCase().includes(s));
    });
  }, [groups, q]);

  function setCostEdit(groupKey: string, value: string) {
    setCostEdits((prev) => ({ ...prev, [groupKey]: value }));
  }

  async function saveCost(groupKey: string) {
    if (!canSave) return;

    setSavingKey(groupKey);
    try {
      const raw = (costEdits[groupKey] ?? "").trim();
      const draftCost = raw === "" ? null : Number(raw);

      await fetch("/api/draft/admin/siblings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupKey, draftCost }),
      });

      await loadGroups();
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Siblings</h1>
        <div className="text-sm text-muted-foreground">
          Automatically groups eligible players registered by the same person.
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by parent email/phone or player..."
          className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
        />
        <button onClick={loadGroups} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-4">Registrant</div>
          <div className="col-span-6">Players</div>
          <div className="col-span-1 text-right">Draft Cost</div>
          <div className="col-span-1 text-right">Save</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : filteredGroups.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No sibling groups found.</div>
        ) : (
          <div className="divide-y">
            {filteredGroups.map((g) => {
              const players = g.players ?? [];
              const uniqueCount = new Set(players.map((p) => p.id)).size;
              const edit = costEdits[g.groupKey] ?? "";
              const isSaving = savingKey === g.groupKey;

              return (
                <div key={g.groupKey} className="px-3 py-3">
                  <div className="grid grid-cols-12 gap-0 items-start">
                    <div className="col-span-4">
                      <div className="font-semibold break-words">{g.groupKey}</div>
                      <div className="text-xs text-muted-foreground">
                        {uniqueCount} children (listed twice for draft cost)
                      </div>
                    </div>

                    <div className="col-span-6">
                      <div className="grid gap-1">
                        {players.map((p, idx) => (
                          <div key={`${p.id}-${idx}`} className="text-sm">
                            {p.fullName}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {canSave ? (
                        <input
                          type="number"
                          value={edit}
                          onChange={(e) => setCostEdit(g.groupKey, e.target.value)}
                          className="w-20 rounded-md border px-2 py-1 text-sm text-right"
                        />
                      ) : (
                        <div className="w-20 text-right text-sm text-muted-foreground">
                          {g.draftCost === null || g.draftCost === undefined ? "" : g.draftCost}
                        </div>
                      )}
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {canSave ? (
                        <button
                          onClick={() => saveCost(g.groupKey)}
                          disabled={isSaving}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                        >
                          {isSaving ? "Saving…" : "Save"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground"></span>
                      )}
                    </div>
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
