"use client";

import React, { useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; order: number };
type Player = {
  id: string;
  fullName: string;
  dob: string | null;
  gender: string | null;
  jerseySize: string | null;
  guardian1Name: string | null;
  guardian2Name: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
};

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows: any[][]) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
function fmtDate(dob: string | null) {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}
function slugify(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadImageAsDataUrl(src: string): Promise<string> {
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load image: ${src}`);
  const blob = await res.blob();

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image blob"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function addLogo(doc: any, opts?: { corner?: "tl" | "tr"; size?: number; pad?: number }) {
  const corner = opts?.corner ?? "tr";
  const size = opts?.size ?? 44; 
  const pad = opts?.pad ?? 30; 

  const pageW = doc.internal.pageSize.getWidth();
  const x = corner === "tr" ? pageW - pad - size : pad;
  const y = pad;

  if (doc.__logoDataUrl) {
    doc.addImage(doc.__logoDataUrl, "PNG", x, y, size, size);
  }
}

export default function MyRosterPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function load() {
    setErr(null);
    const res = await fetch("/api/draft/team/me", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErr(json?.error ?? "Failed to load roster");
      return;
    }

    setTeam(json.team ?? null);
    setPlayers(json.players ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const dateStamp = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }, []);

  const csvFilename = useMemo(() => {
    const safeTeam = slugify(team?.name ?? "my-roster");
    return `roster-${safeTeam}-${dateStamp}.csv`;
  }, [team?.name, dateStamp]);

  const pdfFilename = useMemo(() => {
    const safeTeam = slugify(team?.name ?? "my-roster");
    return `roster-${safeTeam}-${dateStamp}.pdf`;
  }, [team?.name, dateStamp]);

  function handleDownloadCsv() {
    const rows: any[][] = [
      ["Team", team?.name ?? ""],
      [],
      ["Player", "DOB", "Gender", "Jersey Size", "Guardian 1", "Guardian 2", "Primary Phone", "Primary Email"],
      ...players.map((p) => [
        p.fullName ?? "",
        fmtDate(p.dob),
        p.gender ?? "",
        p.jerseySize ?? "",
        p.guardian1Name ?? "",
        p.guardian2Name ?? "",
        p.primaryPhone ?? "",
        p.primaryEmail ?? "",
      ]),
    ];

    downloadTextFile(csvFilename, toCsv(rows));
  }

  async function handleDownloadPdf() {
    if (!team || players.length === 0) return;

    setDownloadingPdf(true);
    try {
      const [{ jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

      const doc: any = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

      doc.__logoDataUrl = await loadImageAsDataUrl("/branding/cys-logo.png");
      addLogo(doc, { corner: "tr", size: 44, pad: 30 });

      const marginX = 40;
      let y = 90;

      doc.setFontSize(16);
      doc.text("My Roster", marginX, 60);

      doc.setFontSize(11);
      doc.text(`Team: ${team.name}`, marginX, 78);

      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
      y += 14;

      const head = [[
        "Player",
        "DOB",
        "Gender",
        "Jersey",
        "Guardian(s)",
        "Phone",
        "Email",
      ]];

      const body = players.map((p) => [
        p.fullName ?? "",
        fmtDate(p.dob),
        p.gender ?? "",
        p.jerseySize ?? "",
        [p.guardian1Name, p.guardian2Name].filter(Boolean).join(" / "),
        p.primaryPhone ?? "",
        p.primaryEmail ?? "",
      ]);

      autoTable(doc, {
        startY: y + 10,
        head,
        body,
        margin: { left: marginX, right: marginX },
        styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 55 },
          2: { cellWidth: 45 },
          3: { cellWidth: 55 },
          4: { cellWidth: 105 },
          5: { cellWidth: 80 },
          6: { cellWidth: "auto" },
        },
        didDrawPage: () => {
          addLogo(doc, { corner: "tr", size: 44, pad: 30 });
        },
      });

      doc.save(pdfFilename);
    } catch (e) {
      console.error(e);
      alert("PDF download failed. Make sure 'jspdf' and 'jspdf-autotable' are installed, and the logo exists at /public/branding/cys-logo.png.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (err) {
    return (
      <div className="py-8">
        <h1 className="text-3xl font-semibold tracking-tight">My Roster</h1>
        <div className="mt-4 text-sm text-red-600">{err}</div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">My Roster</h1>
          <div className="text-sm text-muted-foreground">
            {team ? `Team: ${team.name}` : "No team assigned to this coach yet."}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!team || players.length === 0}
            className="inline-flex items-center justify-center rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download CSV
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!team || players.length === 0 || downloadingPdf}
            className="inline-flex items-center justify-center rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloadingPdf ? "Building PDF..." : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-0 bg-muted px-3 py-2 text-xs font-semibold">
          <div className="col-span-4 sm:col-span-3">Player</div>
          <div className="hidden sm:block sm:col-span-2">DOB</div>
          <div className="hidden sm:block sm:col-span-1">Gender</div>
          <div className="hidden sm:block sm:col-span-2">Jersey</div>
          <div className="col-span-4 sm:col-span-2">Guardian(s)</div>
          <div className="col-span-4 sm:col-span-2">Contact</div>
        </div>

        {players.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No drafted players yet.</div>
        ) : (
          <div className="divide-y">
            {players.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-0 px-3 py-3 text-sm items-start">
                <div className="col-span-4 sm:col-span-3 font-semibold">{p.fullName}</div>

                <div className="hidden sm:block sm:col-span-2 text-muted-foreground">
                  {p.dob ? fmtDate(p.dob) : ""}
                </div>

                <div className="hidden sm:block sm:col-span-1 text-muted-foreground">{p.gender ?? ""}</div>

                <div className="hidden sm:block sm:col-span-2 text-muted-foreground">{p.jerseySize ?? ""}</div>

                <div className="col-span-4 sm:col-span-2 text-muted-foreground">
                  {[p.guardian1Name, p.guardian2Name].filter(Boolean).join(" / ")}
                </div>

                <div className="col-span-4 sm:col-span-2 text-muted-foreground">
                  <div>{p.primaryPhone ?? ""}</div>
                  <div className="text-xs break-all">{p.primaryEmail ?? ""}</div>

                  <div className="mt-2 text-xs sm:hidden">
                    <div>DOB: {fmtDate(p.dob)}</div>
                    <div>Gender: {p.gender ?? ""}</div>
                    <div>Jersey: {p.jerseySize ?? ""}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
