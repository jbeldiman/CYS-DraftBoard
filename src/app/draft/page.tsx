"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DraftPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/live-draft");
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Draft Board</h1>
      <p>Redirecting…</p>
    </main>
  );
}
