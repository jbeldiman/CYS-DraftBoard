import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-4">
        <h1 className="text-4xl font-bold">CYS Draft Hub</h1>
        <p className="text-muted-foreground">
          Draft board • siblings • history • admin
        </p>
        <div className="flex gap-3">
          <Link className="underline" href="/draft">Go to Draft</Link>
          <Link className="underline" href="/siblings">Siblings</Link>
          <Link className="underline" href="/admin">Admin</Link>
        </div>
      </div>
    </main>
  );
}
