"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/admin", label: "Admin" },
  { href: "/siblings", label: "Siblings" },
  { href: "/players", label: "Players" },
] as const;

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border bg-card shadow-sm">
                🏆
              </span>
              CYS Draft Board
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx(
                      "rounded-md px-3 py-1.5 text-sm transition",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
                Internal Tool
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="p-6">{children}</div>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>© {new Date().getFullYear()} CYS Draft Board</span>
          <span className="hidden sm:inline">Built for draft night operations</span>
        </div>
      </footer>
    </div>
  );
}
