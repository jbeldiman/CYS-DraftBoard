"use client";

import { useEffect, useRef, useState } from "react";

type Coach = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
};

export default function AdminPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pickClockSeconds, setPickClockSeconds] = useState<number>(120);
  const [draftStatus, setDraftStatus] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function loadCoaches() {
    const res = await fetch("/api/admin/coaches", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load coaches (are you logged in as ADMIN?)");
    const json = await res.json();
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

  async function startDraft() {
    setMsg(null);
    setErr(null);

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

    setMsg("Draft started.");
    await loadDraftState();
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

  async function uploadCsv(file: File) {
    setUploadMsg(null);
    setUploadErr(null);
    setUploading(true);

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
        setUploadErr(message);
        return;
      }

      setUploadMsg(`Uploaded. Processed ${json.processed} players. Eligible: ${json.eligibleRows}.`);
      await loadDraftState();
    } finally {
      setUploading(false);
    }
  }

  const phase = draftStatus?.phase ?? "(unknown)";
  const isLive = phase === "LIVE";
  const isPaused = !!draftStatus?.isPaused;
  const uploadLocked = isLive;

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Admin</h1>
      <p style={{ opacity: 0.8 }}>Upload registrations + run the draft.</p>

      {err ? <div style={{ marginTop: 12, color: "crimson" }}>{err}</div> : null}
      {msg ? <div style={{ marginTop: 12, color: "green" }}>{msg}</div> : null}

      <hr style={{ margin: "16px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Upload CSV Here</h2>
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
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (uploadLocked) return;
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) uploadCsv(f);
          }}
          onClick={() => {
            if (uploadLocked) return;
            fileInputRef.current?.click();
          }}
          style={{
            marginTop: 10,
            border: `2px dashed ${dragOver ? "#111" : "#bbb"}`,
            borderRadius: 14,
            padding: 18,
            cursor: uploadLocked ? "not-allowed" : "pointer",
            background: dragOver ? "rgba(0,0,0,0.04)" : "transparent",
            opacity: uploadLocked ? 0.7 : 1,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Drag & drop registrations CSV here</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Or click to select a file. This will import players, eligibility, jersey size, and parent contact info.
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              disabled={uploading || uploadLocked}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #222",
                background: uploading || uploadLocked ? "#888" : "#111",
                color: "white",
                fontWeight: 800,
                cursor: uploading || uploadLocked ? "not-allowed" : "pointer",
              }}
            >
              {uploadLocked ? "Upload Locked (LIVE)" : uploading ? "Uploading…" : "Choose File"}
            </button>

            {uploadMsg ? <div style={{ color: "green" }}>{uploadMsg}</div> : null}
            {uploadErr ? <div style={{ color: "crimson" }}>{uploadErr}</div> : null}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={uploading || uploadLocked}
            style={{ display: "none" }}
            onChange={(e) => {
              if (uploadLocked) return;
              const f = e.target.files?.[0];
              if (f) uploadCsv(f);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Draft Controls</h2>
      <div style={{ display: "grid", gap: 10, maxWidth: 620 }}>
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={startDraft}
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #222",
              background: "#111",
              color: "white",
              fontWeight: 800,
              maxWidth: 220,
            }}
          >
            Start Draft
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
        </div>

        <div
          style={{
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 10,
            maxWidth: 620,
          }}
        >
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

      <h2 style={{ fontSize: 18, fontWeight: 700 }}>Coaches</h2>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {coaches.map((c) => (
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
            <div>
              <div style={{ fontWeight: 800 }}>{c.name ?? "(no name)"}</div>
              <div style={{ opacity: 0.8 }}>{c.email}</div>
            </div>

            <a href={`/draft?view=${encodeURIComponent(c.id)}`} style={{ textDecoration: "underline", fontWeight: 700 }}>
              View Board
            </a>
          </div>
        ))}
        {coaches.length === 0 ? <div style={{ opacity: 0.7 }}>No coaches yet.</div> : null}
      </div>
    </main>
  );
}
