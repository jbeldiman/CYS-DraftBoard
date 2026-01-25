"use client";

import Link from "next/link";

function ActionButton({
  href,
  label,
  sublabel,
}: {
  href: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <Link
      href={href}
      className="group w-full rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-left shadow-sm backdrop-blur transition
                 hover:bg-white/15 hover:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-white">{label}</div>
          {sublabel ? (
            <div className="mt-0.5 text-sm text-white/75">{sublabel}</div>
          ) : null}
        </div>

        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white/90 transition group-hover:bg-white/15">
          →
        </span>
      </div>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="-m-6 sm:-m-8">
      {/* Full-bleed hero */}
      <div className="relative min-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border bg-black shadow-sm">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/hero-field.jpg')" }}
        />

        {/* Readability overlays */}
        <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/35 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex min-h-[calc(100vh-7rem)] items-center">
          <div className="mx-auto w-full max-w-6xl px-6 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left spacer (keeps the field visible on desktop) */}
              <div className="hidden lg:block lg:col-span-6" />

              {/* Right content */}
              <div className="lg:col-span-6 flex justify-center lg:justify-end">
                <div className="w-full max-w-md">
                  <div className="mb-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur">
                      Draft Night Command Center
                    </div>

                    <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
                      CYS Draft Hub
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-white/80">
                      Run the draft, track picks, and manage rosters—fast.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <ActionButton
                      href="/live-draft"
                      label="Live Draft"
                      sublabel="Clock • recent picks • remaining players"
                    />
                    <ActionButton
                      href="/draft"
                      label="My Draft Board"
                      sublabel="Your coach board (or choose a coach)"
                    />
                    <ActionButton
                      href="/rosters"
                      label="My Roster"
                      sublabel="Players drafted to your team"
                    />
                    <ActionButton
                      href="/players"
                      label="Full Player List"
                      sublabel="Eligible players and details"
                    />
                  </div>

                  <div className="mt-6 text-xs text-white/65">
                    Tip: Keep this page open on a big screen for quick navigation.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
      </div>
    </div>
  );
}
