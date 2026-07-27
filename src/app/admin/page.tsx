"use client";

import { useEffect, useState } from "react";
import CoachManagementPanel from "@/components/admin/CoachManagementPanel";
import SeasonImportPanel from "@/components/admin/SeasonImportPanel";

type Division = "U11" | "U13";

type DraftStatus = {
  id?: string;
  name?: string;
  phase?: string;
  division?: Division | null;
  season?: string | null;
  seasonYear?: number | null;
  currentPick?: number;
  isPaused?: boolean;
};

async function responseMessage(response: Response) {
  const json = await response.json().catch(() => ({}));
  return { json, message: json?.error ?? json?.message ?? `Request failed (${response.status})` };
}

export default function AdminPage() {
  const [draftStatus, setDraftStatus] = useState<DraftStatus | null>(null);
  const [pickClockSeconds, setPickClockSeconds] = useState(120);
  const [syncingTeams, setSyncingTeams] = useState(false);
  const [startingDraft, setStartingDraft] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadDraftState() {
    const response = await fetch("/api/draft/state", { cache: "no-store" });
    if (!response.ok) return;
    const json = await response.json().catch(() => ({}));
    setDraftStatus(json?.event ?? null);
  }

  useEffect(() => {
    loadDraftState();
  }, []);

  async function syncTeams(options?: { quiet?: boolean }) {
    if (!options?.quiet) {
      setMessage(null);
      setError(null);
    }
    setSyncingTeams(true);
    try {
      const response = await fetch("/api/draft/admin/sync-teams", { method: "POST" });
      const { json, message: apiError } = await responseMessage(response);
      if (!response.ok) throw new Error(apiError);
      await loadDraftState();
      if (!options?.quiet) {
        setMessage(`${json?.teams?.length ?? 0} ${json?.division ?? ""} teams synced to the active draft.`);
      }
      return Number(json?.teams?.length ?? 0);
    } finally {
      setSyncingTeams(false);
    }
  }

  async function startDraft() {
    setMessage(null);
    setError(null);
    setStartingDraft(true);
    try {
      const teamCount = await syncTeams({ quiet: true });
      if (teamCount < 2) {
        throw new Error("The active division needs at least two coaches before the draft can start.");
      }

      const response = await fetch("/api/draft/admin/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickClockSeconds }),
      });
      const { message: apiError } = await responseMessage(response);
      if (!response.ok) throw new Error(apiError);
      await loadDraftState();
      setMessage(`${draftStatus?.division ?? "Active"} draft started with ${teamCount} teams.`);
    } catch (startError: any) {
      setError(startError?.message ?? "Failed to start draft");
    } finally {
      setStartingDraft(false);
    }
  }

  async function togglePause() {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/draft/admin/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !draftStatus?.isPaused }),
      });
      const { message: apiError } = await responseMessage(response);
      if (!response.ok) throw new Error(apiError);
      setMessage(draftStatus?.isPaused ? "Draft resumed." : "Draft paused.");
      await loadDraftState();
    } catch (pauseError: any) {
      setError(pauseError?.message ?? "Failed to update pause state");
    }
  }

  async function stopDraft() {
    const confirmed = window.confirm("Stop the active draft? Existing picks and player data will remain preserved.");
    if (!confirmed) return;

    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/draft/admin/stop", { method: "POST" });
      const { message: apiError } = await responseMessage(response);
      if (!response.ok) throw new Error(apiError);
      setMessage("Draft stopped. Existing picks were preserved.");
      await loadDraftState();
    } catch (stopError: any) {
      setError(stopError?.message ?? "Failed to stop draft");
    }
  }

  const phase = draftStatus?.phase ?? "UNKNOWN";
  const isLive = phase === "LIVE";
  const activeDivision = draftStatus?.division ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-7">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">CYS Draft Control Center</div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Draft Night Admin</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Separate U11 and U13 player pools, coaches, teams, draft orders, imports, restarts, and historical exports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/draft/admin/export-results"
              className="rounded-xl border border-emerald-400/50 bg-emerald-400/10 px-4 py-2.5 text-sm font-black text-emerald-100 hover:bg-emerald-400/20"
            >
              Download Active Results
            </a>
            <a
              href="/admin/approvals"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/20"
            >
              Account Approvals
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Active Event</div>
            <div className="mt-1 font-black">{draftStatus?.name ?? "Not selected"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Division</div>
            <div className="mt-1 text-2xl font-black text-emerald-300">{activeDivision ?? "—"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Phase</div>
            <div className="mt-1 text-2xl font-black">{phase}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Current Pick</div>
            <div className="mt-1 text-2xl font-black">{draftStatus?.currentPick ?? 1}</div>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-800">{error}</div> : null}
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-bold text-emerald-800">
          {message}
        </div>
      ) : null}

      <SeasonImportPanel onActiveEventChanged={loadDraftState} />

      <CoachManagementPanel activeDivision={activeDivision} onTeamsChanged={loadDraftState} />

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Live controls</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Run the Active Draft</h2>
            <p className="mt-1 text-sm text-slate-600">
              Teams are generated only from the active division’s coach roster and saved order.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <span className="font-bold text-slate-600">Current:</span>{" "}
            <span className="font-black text-slate-950">
              {activeDivision ?? "No division"} · {phase} · {draftStatus?.isPaused ? "Paused" : "Running"}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr] lg:items-end">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Pick clock (seconds)
            <input
              type="number"
              min={15}
              value={pickClockSeconds}
              onChange={(event) => setPickClockSeconds(Number(event.target.value))}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-slate-950"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => syncTeams().catch((syncError) => setError(syncError?.message ?? "Failed to sync teams"))}
              disabled={syncingTeams || !activeDivision}
              className="rounded-xl bg-emerald-700 px-4 py-2.5 font-black text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {syncingTeams ? "Syncing…" : `Sync ${activeDivision ?? "Active"} Teams`}
            </button>
            <button
              type="button"
              onClick={startDraft}
              disabled={startingDraft || syncingTeams || isLive || !activeDivision}
              className="rounded-xl bg-slate-950 px-4 py-2.5 font-black text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {startingDraft ? "Starting…" : "Start Draft"}
            </button>
            <button
              type="button"
              onClick={togglePause}
              disabled={!isLive}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {draftStatus?.isPaused ? "Resume Draft" : "Pause Draft"}
            </button>
            <button
              type="button"
              onClick={stopDraft}
              disabled={!isLive}
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Stop Draft
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
