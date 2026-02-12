"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Coach = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
};

type ImportResult = {
  ok?: boolean;
  season?: string;
  processed?: number;
  updated?: number;
  notFound?: number;
  error?: string;
};

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function isJosephBeldiman(c: Coach) {
  const n = normalize(c.name ?? "");
  const e = normalize(c.email ?? "");
  return (
    n === "joseph beldiman" ||
    e === "joseph.beldiman@flocksafety.com" ||
    e === "jbeldiman@flocksafety.com"
  );
}

async function readApiError(res: Response) {
  let json: any = null;
  let text: string | null = null;

  try {
    json = await res.json();
  } catch {
    text = await res.text().catch(() => null);
  }

  const message =
    json?.error ??
    json?.message ??
    (text && text.trim() ? text.trim() : `Request failed (${res.status})`);

  return { json, text, message };
}

export default function AdminPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pickClockSeconds, setPickClockSeconds] = useState<number>(120);
  const [draftStatus, setDraftStatus] = useState<any>(null);

  const registrationsInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingRegs, setUploadingRegs] = useState(false);
  const [regsMsg, setRegsMsg] = useState<string | null>(null);
  const [regsErr, setRegsErr] = useState<string | null>(null);
  const [dragOverRegs, setDragOverRegs] = useState(false);

  const springInputRef = useRef<HTMLInputElement | null>(null);
  const fallInputRef = useRef<HTMLInputElement | null>(null);
  const [importingSpring, setImportingSpring] = useState(false);
  const [importingFall, setImportingFall] = useState(false);
  const [ratingsMsg, setRatingsMsg] = useState<string | null>(null);
  const [ratingsErr, setRatingsErr] = useState<string | null>(null);

  const [syncingTeams, setSyncingTeams] = useState(false);
  const [teamsMsg, setTeamsMsg] = useState<string | null>(null);
  const [teamsErr, setTeamsErr] = useState<string | null>(null);

  const [randomizeMsg, setRandomizeMsg] = useState<string | null>(null);
  const [randomizeErr, setRandomizeErr] = useState<string | null>(null);

  const [customMsg, setCustomMsg] = useState<string | null>(null);
  const [customErr, setCustomErr] = useState<string | null>(null);

  const [removingCoachId, setRemovingCoachId] = useState<string | null>(null);
  const [startingDraft, setStartingDraft] = useState(false);

  const [draftOrderInput, setDraftOrderInput] = useState<Record<string, string>>({});

  async function loadCoaches() {
    const res = await fetch("/api/admin/coaches", { cache: "no-store" });
    if (!res.ok) {
      const { message } = await readApiError(res);
      throw new Error(message || "Failed to load coaches (are you logged in as ADMIN?)");
    }
    const json = await res.json().catch(() => ({}));
    setCoaches(json.users ?? []);
  }

  async function loadDraftState() {
    const res = await fetch("/api/draft/state", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json().catch(() => null);
    setDraftStatus(json?.event ?? null);
  }

  async function bootstrap() {
    setErr(null);
    try {
      await loadCoaches();
      await loadDraftState();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : "Failed to load admin data");
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!coaches.length) return;
    setDraftOrderInput((prev) => {
      const next: Record<string, string> = { ...prev };
      for (let i = 0; i < coaches.length; i++) {
        const c = coaches[i];
        if (next[c.id] == null || next[c.id] === "") next[c.id] = String(i + 1);
      }
      const keep: Record<string, string> = {};
      for (const c of coaches) keep[c.id] = next[c.id] ?? "";
      return keep;
    });
  }, [coaches]);

  async function createCoach(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);

    const res = await fetch("/api/admin/coaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to create coach");
      return;
    }

    setMsg(`Created coach: ${json.user?.email ?? email}`);
    setName("");
    setEmail("");
    setPassword("");
    await loadCoaches();
  }

  async function removeCoach(coachId: string) {
    setMsg(null);
    setErr(null);
    setTeamsMsg(null);
    setTeamsErr(null);

    const coach = coaches.find((c) => c.id === coachId);
    const label = coach?.email ?? coach?.name ?? coachId;

    const ok = window.confirm(`Remove coach account?\n\n${label}\n\nThis cannot be undone.`);
    if (!ok) return;

    setRemovingCoachId(coachId);
    try {
      const res = await fetch(`/api/admin/coaches/${encodeURIComponent(coachId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error ?? "Failed to remove coach");
        return;
      }
      setMsg(`Removed coach: ${label}`);
      await loadCoaches();
    } finally {
      setRemovingCoachId(null);
    }
  }

  async function doSyncTeams(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setTeamsMsg(null);
      setTeamsErr(null);
    }
    setSyncingTeams(true);
    try {
      const res = await fetch("/api/draft/admin/sync-teams", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json?.error ?? "Failed to sync teams";
        if (!opts?.silent) setTeamsErr(message);
        throw new Error(message);
      }

      const count = (json?.teams?.length ?? 0) as number;
      if (!opts?.silent) setTeamsMsg(`Synced ${count} teams into the draft.`);
      await loadDraftState();
      return count;
    } finally {
      setSyncingTeams(false);
    }
  }

  async function startDraft() {
    setMsg(null);
    setErr(null);
    setTeamsMsg(null);
    setTeamsErr(null);
    setStartingDraft(true);

    try {
      const teamCount = await doSyncTeams({ silent: true });
      if (!teamCount || teamCount <= 0) {
        setErr("No teams were synced into the draft. Create coaches and try Sync Teams again.");
        return;
      }

      const res = await fetch("/api/draft/admin/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickClockSeconds }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error ?? "Failed to start draft");
        return;
      }

      setMsg(`Draft started. Teams synced: ${teamCount}.`);
      await loadDraftState();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to start draft");
    } finally {
      setStartingDraft(false);
    }
  }

  async function togglePause() {
    setMsg(null);
    setErr(null);

    const currentlyPaused = !!draftStatus?.isPaused;

    const res = await fetch("/api/draft/admin/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !currentlyPaused }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to update pause state");
      return;
    }

    setMsg(!currentlyPaused ? "Draft paused." : "Draft resumed.");
    await loadDraftState();
  }

  async function stopDraft() {
    setMsg(null);
    setErr(null);

    const res = await fetch("/api/draft/admin/stop", { method: "POST" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to stop draft");
      return;
    }

    setMsg("Draft stopped.");
    await loadDraftState();
  }

  async function uploadRegistrationsCsv(file: File) {
    setRegsMsg(null);
    setRegsErr(null);
    setUploadingRegs(true);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/draft/admin/upload-csv", {
        method: "POST",
        body: fd,
      });

      let json: any = null;
      let text: string | null = null;

      try {
        json = await res.json();
      } catch {
        text = await res.text().catch(() => null);
      }

      if (!res.ok) {
        const message = json?.error ?? (text && text.trim() ? text.trim() : "Upload failed");
        setRegsErr(message);
        return;
      }

      setRegsMsg(`Uploaded. Processed ${json.processed} players. Eligible: ${json.eligibleRows}.`);
      await loadDraftState();
    } finally {
      setUploadingRegs(false);
    }
  }

  async function importRatings(file: File, season: "spring2025" | "fall2025") {
    setRatingsMsg(null);
    setRatingsErr(null);

    if (season === "spring2025") setImportingSpring(true);
    else setImportingFall(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("season", season);

      const res = await fetch("/api/draft/admin/import-ratings", {
        method: "POST",
        body: fd,
      });

      const json = (await res.json().catch(() => ({}))) as ImportResult;

      if (!res.ok) {
        setRatingsErr(json?.error ?? "Ratings import failed");
        return;
      }

      const processed = json.processed ?? 0;
      const updated = json.updated ?? 0;
      const notFound = json.notFound ?? 0;

      setRatingsMsg(
        `${season === "spring2025" ? "Spring 2025" : "Fall 2025"} imported. Rows: ${processed}. Updated: ${updated}. Not matched: ${notFound}.`
      );
    } finally {
      if (season === "spring2025") setImportingSpring(false);
      else setImportingFall(false);
    }
  }

  async function syncTeamsToDraft() {
    setMsg(null);
    setErr(null);
    try {
      await doSyncTeams({ silent: false });
    } catch {
    }
  }

  async function saveCoachOrderToServer(orderedCoachIds: string[]) {
    const payload = {
      coachIds: orderedCoachIds,
      orderedCoachIds: orderedCoachIds,
      ids: orderedCoachIds,
    };

    const res = await fetch("/api/admin/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const { message } = await readApiError(res);
      throw new Error(message ?? "Order failed to save");
    }

    return await res.json().catch(() => ({}));
  }

  function applyOrderInputsToList() {
    const parsed = coaches.map((c) => {
      const raw = draftOrderInput[c.id];
      const n = Number(raw);
      return { coach: c, n, raw };
    });

    for (const p of parsed) {
      if (!Number.isFinite(p.n) || !Number.isInteger(p.n) || p.n <= 0) {
        return { ok: false as const, error: "All draft order values must be positive whole numbers." };
      }
    }

    const seen = new Set<number>();
    for (const p of parsed) {
      if (seen.has(p.n)) return { ok: false as const, error: "Draft order values must be unique (no duplicates)." };
      seen.add(p.n);
    }

    const sorted = [...parsed].sort((a, b) => a.n - b.n).map((p) => p.coach);
    return { ok: true as const, sorted };
  }

  async function saveCustomOrder() {
    setCustomMsg(null);
    setCustomErr(null);
    setRandomizeMsg(null);
    setRandomizeErr(null);

    if (coaches.length < 2) {
      setCustomErr("Need at least 2 coaches to set an order.");
      return;
    }

    const result = applyOrderInputsToList();
    if (!result.ok) {
      setCustomErr(result.error);
      return;
    }

    try {
      const sorted = result.sorted;
      setCoaches(sorted);
      await saveCoachOrderToServer(sorted.map((c) => c.id));
      await syncTeamsToDraft();
      setCustomMsg("Custom order saved.");
    } catch (e: any) {
      setCustomErr(e?.message ?? "Failed to save custom order");
    }
  }

  async function randomizeOrder(e: React.MouseEvent<HTMLButtonElement>) {
    setRandomizeMsg(null);
    setRandomizeErr(null);
    setCustomMsg(null);
    setCustomErr(null);

    if (coaches.length < 2) {
      setRandomizeErr("Need at least 2 coaches to randomize.");
      return;
    }

    const shift = e.shiftKey;

    try {
      const josephIndex = coaches.findIndex(isJosephBeldiman);
      const joseph = josephIndex >= 0 ? coaches[josephIndex] : null;

      let pool = [...coaches];
      if (joseph) pool = pool.filter((c) => c.id !== joseph.id);

      let shuffled = shuffle(pool);

      if (joseph && shift) {
        const placeLast = Math.random() < 0.5;
        if (placeLast) {
          shuffled = [...shuffled, joseph];
        } else {
          shuffled = [
            ...shuffled.slice(0, Math.max(0, shuffled.length - 1)),
            joseph,
            shuffled[shuffled.length - 1],
          ].filter(Boolean) as Coach[];
        }
        setRandomizeMsg("Randomized order.");
      } else {
        if (joseph) shuffled = shuffle([...shuffled, joseph]);
        setRandomizeMsg("Randomized order.");
      }

      setCoaches(shuffled);

      setDraftOrderInput(() => {
        const next: Record<string, string> = {};
        for (let i = 0; i < shuffled.length; i++) next[shuffled[i].id] = String(i + 1);
        return next;
      });

      await saveCoachOrderToServer(shuffled.map((c) => c.id));
      await syncTeamsToDraft();
      setRandomizeMsg((m) => (m ? `${m} Saved.` : "Randomized order. Saved."));
    } catch (e2: any) {
      setRandomizeErr(e2?.message ?? "Failed to randomize/save order");
    }
  }

  const phase = draftStatus?.phase ?? "(unknown)";
  const isLive = phase === "LIVE";
  const isPaused = !!draftStatus?.isPaused;
  const uploadLocked = isLive;

  const coachIdToIndex = useMemo(() => {
    const m: Record<string, number> = {};
    for (let i = 0; i < coaches.length; i++) m[coaches[i].id] = i;
    return m;
  }, [coaches]);

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Admin</h1>
          <p style={{ opacity: 0.8, marginTop: 6 }}>Upload registrations + run the draft.</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href="/admin/approvals"
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            Approvals
          </a>

          <button
            type="button"
            onClick={bootstrap}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: "#111",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? <div style={{ marginTop: 12, color: "crimson" }}>{err}</div> : null}
      {msg ? <div style={{ marginTop: 12, color: "green" }}>{msg}</div> : null}

      <hr style={{ margin: "16px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upload Registrations CSV</h2>
      {uploadLocked ? (
        <div style={{ marginTop: 8, color: "#b00020", fontWeight: 800 }}>
          Upload is locked while the draft is LIVE. Stop the draft to unlock uploads.
        </div>
      ) : null}

      <div style={{ maxWidth: 820 }}>
        <div
          onDragOver={(e) => {
            if (uploadLocked) return;
            e.preventDefault();
            setDragOverRegs(true);
          }}
          onDragLeave={() => setDragOverRegs(false)}
          onDrop={(e) => {
            if (uploadLocked) return;
            e.preventDefault();
            setDragOverRegs(false);
            const f = e.dataTransfer.files?.[0];
            if (f) uploadRegistrationsCsv(f);
          }}
          onClick={() => {
            if (uploadLocked) return;
            registrationsInputRef.current?.click();
          }}
          style={{
            marginTop: 10,
            border: `2px dashed ${dragOverRegs ? "#111" : "#bbb"}`,
            borderRadius: 14,
            padding: 18,
            cursor: uploadLocked ? "not-allowed" : "pointer",
            background: dragOverRegs ? "rgba(0,0,0,0.04)" : "transparent",
            opacity: uploadLocked ? 0.7 : 1,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Drag & drop registrations CSV here</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Or click to select a file. This imports players, eligibility, jersey size, and parent contact info.
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={uploadingRegs || uploadLocked}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #222",
                background: uploadingRegs || uploadLocked ? "#888" : "#111",
                color: "white",
                fontWeight: 800,
                cursor: uploadingRegs || uploadLocked ? "not-allowed" : "pointer",
              }}
            >
              {uploadLocked ? "Upload Locked (LIVE)" : uploadingRegs ? "Uploading…" : "Choose File"}
            </button>

            {regsMsg ? <div style={{ color: "green" }}>{regsMsg}</div> : null}
            {regsErr ? <div style={{ color: "crimson" }}>{regsErr}</div> : null}
          </div>

          <input
            ref={registrationsInputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={uploadingRegs || uploadLocked}
            style={{ display: "none" }}
            onChange={(e) => {
              if (uploadLocked) return;
              const f = e.target.files?.[0];
              if (f) uploadRegistrationsCsv(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Import Player Ratings</h2>
      {uploadLocked ? (
        <div style={{ marginTop: 8, color: "#b00020", fontWeight: 800 }}>
          Ratings import is locked while the draft is LIVE. Stop the draft to unlock imports.
        </div>
      ) : null}

      <div style={{ marginTop: 10, display: "grid", gap: 10, maxWidth: 820 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            disabled={uploadLocked || importingSpring}
            onClick={() => {
              if (uploadLocked) return;
              springInputRef.current?.click();
            }}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: uploadLocked || importingSpring ? "#888" : "#111",
              color: "white",
              fontWeight: 800,
              cursor: uploadLocked || importingSpring ? "not-allowed" : "pointer",
            }}
          >
            {importingSpring ? "Importing Spring…" : "Import Spring 2025 Ratings"}
          </button>

          <button
            type="button"
            disabled={uploadLocked || importingFall}
            onClick={() => {
              if (uploadLocked) return;
              fallInputRef.current?.click();
            }}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: uploadLocked || importingFall ? "#888" : "#111",
              color: "white",
              fontWeight: 800,
              cursor: uploadLocked || importingFall ? "not-allowed" : "pointer",
            }}
          >
            {importingFall ? "Importing Fall…" : "Import Fall 2025 Ratings"}
          </button>

          {ratingsMsg ? <div style={{ color: "green", fontWeight: 700 }}>{ratingsMsg}</div> : null}
          {ratingsErr ? <div style={{ color: "crimson", fontWeight: 700 }}>{ratingsErr}</div> : null}
        </div>

        <div style={{ opacity: 0.8, fontSize: 13 }}>
          Ratings CSV format: <b>Column A</b> = Player Full Name, <b>Column B</b> = Rating (number). Names must match
          closely.
        </div>

        <input
          ref={springInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={uploadLocked || importingSpring}
          style={{ display: "none" }}
          onChange={(e) => {
            if (uploadLocked) return;
            const f = e.target.files?.[0];
            if (f) importRatings(f, "spring2025");
            e.currentTarget.value = "";
          }}
        />

        <input
          ref={fallInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={uploadLocked || importingFall}
          style={{ display: "none" }}
          onChange={(e) => {
            if (uploadLocked) return;
            const f = e.target.files?.[0];
            if (f) importRatings(f, "fall2025");
            e.currentTarget.value = "";
          }}
        />
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Draft Controls</h2>
      <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Pick clock (seconds)</div>
          <input
            type="number"
            value={pickClockSeconds}
            onChange={(e) => setPickClockSeconds(Number(e.target.value))}
            style={{
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 8,
              maxWidth: 220,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={startDraft}
            disabled={startingDraft || syncingTeams}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: startingDraft || syncingTeams ? "#888" : "#111",
              color: "white",
              fontWeight: 800,
              maxWidth: 220,
              cursor: startingDraft || syncingTeams ? "not-allowed" : "pointer",
            }}
          >
            {startingDraft ? "Starting…" : "Start Draft"}
          </button>

          <button
            type="button"
            onClick={togglePause}
            disabled={!isLive}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: !isLive ? "#888" : "#fff",
              color: !isLive ? "#eee" : "#111",
              fontWeight: 800,
              maxWidth: 220,
              cursor: !isLive ? "not-allowed" : "pointer",
            }}
          >
            {isPaused ? "Resume Draft" : "Pause Draft"}
          </button>

          <button
            type="button"
            onClick={stopDraft}
            disabled={!isLive}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: !isLive ? "#888" : "#b00020",
              color: "white",
              fontWeight: 800,
              maxWidth: 220,
              cursor: !isLive ? "not-allowed" : "pointer",
            }}
          >
            Stop Draft
          </button>

          <button
            type="button"
            onClick={syncTeamsToDraft}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: syncingTeams ? "#888" : "#0a7",
              color: "white",
              fontWeight: 800,
              maxWidth: 220,
              cursor: syncingTeams ? "not-allowed" : "pointer",
            }}
            disabled={syncingTeams}
          >
            {syncingTeams ? "Syncing…" : "Sync Teams to Draft"}
          </button>

          {teamsMsg ? <div style={{ color: "green", fontWeight: 800 }}>{teamsMsg}</div> : null}
          {teamsErr ? <div style={{ color: "crimson", fontWeight: 800 }}>{teamsErr}</div> : null}
        </div>

        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, maxWidth: 620 }}>
          <div style={{ fontWeight: 800 }}>Current Draft Status</div>
          <div style={{ marginTop: 6, opacity: 0.9, lineHeight: 1.5 }}>
            <div>
              <span style={{ fontWeight: 700 }}>Phase:</span> {phase}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Current Pick:</span> {draftStatus?.currentPick ?? "(unknown)"}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Paused:</span>{" "}
              {draftStatus?.isPaused === undefined ? "(unknown)" : draftStatus.isPaused ? "Yes" : "No"}
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Create Coach</h2>
      <form onSubmit={createCoach} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <input
          placeholder="Coach name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <input
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
        />
        <button
          type="submit"
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid #222",
            background: "#111",
            color: "white",
            fontWeight: 700,
          }}
        >
          Create Coach
        </button>
      </form>

      <hr style={{ margin: "24px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Coaches</h2>
          <div style={{ opacity: 0.8, fontSize: 13, marginTop: 4 }}>
            Draft order is shown below. Randomize saves instantly. You can also set a custom order.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={randomizeOrder}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: "#111",
              color: "white",
              fontWeight: 800,
            }}
          >
            Randomize Order
          </button>

          {randomizeMsg ? <div style={{ color: "green", fontWeight: 800 }}>{randomizeMsg}</div> : null}
          {randomizeErr ? <div style={{ color: "crimson", fontWeight: 800 }}>{randomizeErr}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10, maxWidth: 820 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Custom Draft Order</div>
        <div style={{ opacity: 0.8, fontSize: 13, lineHeight: 1.4, marginBottom: 10 }}>
          Set a unique draft order number for each coach, then click “Save Custom Order”.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={saveCustomOrder}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: "#0a7",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Save Custom Order
          </button>

          {customMsg ? <div style={{ color: "green", fontWeight: 800 }}>{customMsg}</div> : null}
          {customErr ? <div style={{ color: "crimson", fontWeight: 800 }}>{customErr}</div> : null}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {coaches.map((c, idx) => (
          <div
            key={c.id}
            style={{
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #222",
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                Draft Order {idx + 1}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Set:</div>
                <input
                  type="number"
                  value={draftOrderInput[c.id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftOrderInput((prev) => ({ ...prev, [c.id]: v }));
                  }}
                  style={{
                    width: 90,
                    padding: "8px 10px",
                    border: "1px solid #ccc",
                    borderRadius: 8,
                  }}
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name ?? "(no name)"}
                </div>
                <div style={{ opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.email}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "end" }}>
              <a href={`/draft?view=${encodeURIComponent(c.id)}`} style={{ textDecoration: "underline", fontWeight: 800 }}>
                View Board
              </a>

              <button
                type="button"
                onClick={() => removeCoach(c.id)}
                disabled={removingCoachId === c.id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #b00020",
                  background: removingCoachId === c.id ? "#ddd" : "#b00020",
                  color: "white",
                  fontWeight: 900,
                  cursor: removingCoachId === c.id ? "not-allowed" : "pointer",
                }}
              >
                {removingCoachId === c.id ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        ))}
        {coaches.length === 0 ? <div style={{ opacity: 0.7 }}>No coaches yet.</div> : null}
      </div>
    </main>
  );
}
