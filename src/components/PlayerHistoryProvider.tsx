"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PlayerHistoryIndex } from "@/lib/playerHistory";

type HistoryApiResponse = {
  ok: boolean;
  index?: PlayerHistoryIndex;
};

type PlayerHistoryContextValue = {
  index: PlayerHistoryIndex;
  loading: boolean;
  refresh: () => Promise<void>;
};

const PlayerHistoryContext = createContext<PlayerHistoryContextValue | null>(null);

const EMPTY_INDEX: PlayerHistoryIndex = { seasons: [], byPlayer: {} };

export function PlayerHistoryProvider({ children }: { children: React.ReactNode }) {
  const [index, setIndex] = useState<PlayerHistoryIndex>(EMPTY_INDEX);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = async () => {
    const res = await fetch("/api/player-history", { cache: "no-store" });
    const json = (await res.json()) as HistoryApiResponse;
    setIndex(json?.index ?? EMPTY_INDEX);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
      } catch {
        if (alive) setIndex(EMPTY_INDEX);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<PlayerHistoryContextValue>(
    () => ({
      index,
      loading,
      refresh,
    }),
    [index, loading]
  );

  return <PlayerHistoryContext.Provider value={value}>{children}</PlayerHistoryContext.Provider>;
}

export function usePlayerHistoryIndex() {
  const ctx = useContext(PlayerHistoryContext);
  if (!ctx) {
    return { index: EMPTY_INDEX, loading: false, refresh: async () => {} };
  }
  return ctx;
}
