"use client";

import { useEffect, useMemo, useState } from "react";

type DraftEventSummary = {
  id: string;
  name: string;
  slug: string | null;
  seasonYear: number | null;
  season: "SPRING" | "FALL" | null;
  division: "U11" | "U13" | null;
  phase: "SETUP" | "LIVE" | "COMPLETE" | "ARCHIVED";
  isActive: boolean;
  scheduledAt: string;
  scheduledDateKnown: boolean;
  counts: { players: number; teams: number; picks: number };
};

type ImportResponse = {
  ok?: boolean;
  error?: string;
  fileName?: string;
  fileHash?: string;
  canApply?: boolean;
  applied?: boolean;
  event?: { id: string; name: string; phase: string; division: string | null; season: string | null; seasonYear: number | null };
  summary?: {
    rows: number;
    returningPlayers: number;
    historicalPlayersUpgraded: number;
    dobCorrections: number;
    identityConflicts: number;
    newPermanentPlayers: number;
    newSeasonEntries: number;
    updatedSeasonEntries: number;
    existingPlayersPreserved: number;
    siblingGroups: number;
    errors: number;
    warnings: number;
  };
  errors?: string[];
  warnings?: string[];
  result?: {
    createdProfiles: number;
    upgradedProfiles: number;
    correctedProfiles: number;
    createdEntries: number;
    updatedEntries: number;
    siblingGroups: number;
  };
};

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

function eventLabel(event: DraftEventSummary) {
  const bits = [event.seasonYear, event.season, event.division].filter(Boolean).join(" ");
  return bits || event.name;
}

export default function SeasonImportPanel({ onActiveEventChanged }: { onActiveEventChanged?: () => void | Promise<void> }) {
  const [events, setEvents] = useState<DraftEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importableEvents = useMemo(() => events.filter((event) => event.phase !== "ARCHIVED"), [events]);
  const activeEvent = events.find((event) => event.isActive) ?? null;

  async function loadEvents() {
    const json = await readJson(await fetch("/api/draft/admin/events", { cache: "no-store" }));
    const next = (json.events ?? []) as DraftEventSummary[];
    setEvents(next);
    setSelectedEventId((current) => {
      if (current && next.some((event) => event.id === current && event.phase !== "ARCHIVED")) return current;
      return next.find((event) => event.isActive && event.phase !== "ARCHIVED")?.id ?? next.find((event) => event.phase !== "ARCHIVED")?.id ?? "";
    });
  }

  useEffect(() => {
    loadEvents().catch((err) => setError(err?.message ?? "Failed to load draft events"));
  }, []);

  async function eventAction(action: string, eventId?: string) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const json = await readJson(
        await fetch("/api/draft/admin/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, eventId }),
        })
      );
      const nextEvents = (json.events ?? []) as DraftEventSummary[];
      setEvents(nextEvents);
      if (action === "ensure-fall-2026") setMessage("Fall 2026 U11 and U13 draft events are ready.");
      if (action === "activate") {
        setSelectedEventId(eventId ?? "");
        setPreview(null);
        setMessage("Active draft changed. All live draft pages now use this event.");
        await onActiveEventChanged?.();
      }
      if (action === "archive") {
        setSelectedEventId(
          nextEvents.find((event) => event.isActive && event.phase !== "ARCHIVED")?.id ??
            nextEvents.find((event) => event.phase !== "ARCHIVED")?.id ??
            ""
        );
        setPreview(null);
        setMessage("Draft archived. Its players, teams, picks, ratings, and draft positions are locked in history.");
        await onActiveEventChanged?.();
      }
    } catch (err: any) {
      setError(err?.message ?? "Draft event update failed");
    } finally {
      setLoading(false);
    }
  }

  async function runImport(mode: "preview" | "apply") {
    if (!file || !selectedEventId) {
      setError("Choose a draft event and CSV file first.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("eventId", selectedEventId);
      form.append("mode", mode);
      form.append("file", file);
      const json = (await readJson(
        await fetch("/api/draft/admin/upload-csv", { method: "POST", body: form })
      )) as ImportResponse;
      setPreview(json);
      if (mode === "apply") {
        setMessage(
          `Import complete: ${json.result?.createdEntries ?? 0} seasonal players created and ${json.result?.updatedEntries ?? 0} updated. Historical drafts were untouched.`
        );
        await loadEvents();
        await onActiveEventChanged?.();
      }
    } catch (err: any) {
      setError(err?.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function restartActiveDraft() {
    if (!activeEvent) return;
    const confirmed = window.confirm(
      `Restart ${activeEvent.name}?\n\nThis removes picks and trades from this active event, but preserves players, ratings, teams, sibling settings, saved draft boards, and every archived season.`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await readJson(
        await fetch("/api/draft/admin/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset: true }),
        })
      );
      setMessage(`${activeEvent.name} restarted. Players and historical data were preserved.`);
      setPreview(null);
      await loadEvents();
      await onActiveEventChanged?.();
    } catch (err: any) {
      setError(err?.message ?? "Restart failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Draft Events & Safe Player Import</h2>
          <div style={{ opacity: 0.75, marginTop: 4, fontSize: 13 }}>
            Each season and division has its own event. Imports add or update seasonal records and never replace archived history.
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => eventAction("ensure-fall-2026")}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #166534", background: "#166534", color: "white", fontWeight: 900, cursor: loading ? "not-allowed" : "pointer" }}
        >
          Create Fall 2026 U11 & U13 Events
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {events.map((event) => (
          <div key={event.id} style={{ padding: 12, border: event.isActive ? "2px solid #166534" : "1px solid #ddd", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>
                {event.name} {event.isActive ? <span style={{ color: "#166534" }}>• ACTIVE</span> : null}
              </div>
              <div style={{ opacity: 0.75, fontSize: 13, marginTop: 3 }}>
                {event.phase} · {event.counts.players} players · {event.counts.teams} teams · {event.counts.picks} picks
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {event.phase !== "ARCHIVED" && !event.isActive ? (
                <button type="button" disabled={loading} onClick={() => eventAction("activate", event.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #222", background: "white", fontWeight: 800 }}>
                  Use This Draft
                </button>
              ) : null}
              {event.phase !== "ARCHIVED" && event.phase !== "LIVE" && event.counts.picks > 0 ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (window.confirm(`Archive ${event.name}?\n\nThis locks the event in history and prevents further draft changes.`)) {
                      eventAction("archive", event.id);
                    }
                  }}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #7c3aed", background: "white", color: "#6d28d9", fontWeight: 800 }}
                >
                  Archive Draft
                </button>
              ) : null}
              <a
                href={`/api/draft/admin/export-results?eventId=${encodeURIComponent(event.id)}`}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #166534", color: "#166534", fontWeight: 800, textDecoration: "none" }}
              >
                Download Results
              </a>
            </div>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Preview a season CSV before importing</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={selectedEventId} onChange={(event) => { setSelectedEventId(event.target.value); setPreview(null); }} style={{ padding: 10, border: "1px solid #bbb", borderRadius: 8, minWidth: 240 }}>
            <option value="">Choose draft event</option>
            {importableEvents.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)} — {event.phase}</option>)}
          </select>
          <input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} />
          <button type="button" disabled={loading || !file || !selectedEventId} onClick={() => runImport("preview")} style={{ padding: 10, borderRadius: 8, border: "1px solid #222", background: loading ? "#888" : "#111", color: "white", fontWeight: 900 }}>
            {loading ? "Working…" : "Preview Import"}
          </button>
        </div>

        {preview?.summary ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {[
                ["Rows", preview.summary.rows],
                ["Returning", preview.summary.returningPlayers],
                ["2025 history linked", preview.summary.historicalPlayersUpgraded],
                ["DOB corrections", preview.summary.dobCorrections],
                ["Match conflicts", preview.summary.identityConflicts],
                ["New permanent players", preview.summary.newPermanentPlayers],
                ["New season records", preview.summary.newSeasonEntries],
                ["Season records updated", preview.summary.updatedSeasonEntries],
                ["Existing records preserved", preview.summary.existingPlayersPreserved],
                ["Sibling groups", preview.summary.siblingGroups],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ padding: 10, borderRadius: 8, background: "#f5f5f5" }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
                </div>
              ))}
            </div>

            {preview.errors?.length ? (
              <div style={{ color: "#b00020" }}><b>Errors:</b><ul>{preview.errors.map((item) => <li key={item}>{item}</li>)}</ul></div>
            ) : null}
            {preview.warnings?.length ? (
              <div style={{ color: "#8a4b00" }}><b>Warnings:</b><ul>{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div>
            ) : null}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" disabled={loading || !preview.canApply || preview.applied} onClick={() => runImport("apply")} style={{ padding: 10, borderRadius: 8, border: "1px solid #166534", background: preview.canApply ? "#166534" : "#888", color: "white", fontWeight: 900 }}>
                Import Into {preview.event?.name ?? "Selected Draft"}
              </button>
              <span style={{ fontSize: 13, opacity: 0.75 }}>No players, picks, or teams from another event will be deleted.</span>
            </div>
          </div>
        ) : null}
      </div>

      {activeEvent ? (
        <div style={{ padding: 12, border: "1px solid #f0b4b4", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Restart active draft</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>Clears picks and current-event trades while preserving players, ratings, teams, sibling settings, draft boards, and all historical seasons.</div>
          </div>
          <button type="button" disabled={loading} onClick={restartActiveDraft} style={{ padding: 10, borderRadius: 8, border: "1px solid #b00020", background: "#b00020", color: "white", fontWeight: 900 }}>
            Restart {activeEvent.name}
          </button>
        </div>
      ) : null}

      {message ? <div style={{ color: "#166534", fontWeight: 800 }}>{message}</div> : null}
      {error ? <div style={{ color: "#b00020", fontWeight: 800 }}>{error}</div> : null}
    </section>
  );
}
