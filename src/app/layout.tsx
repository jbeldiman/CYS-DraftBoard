import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import TopNav from "@/components/top-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CYS Draft Hub",
  description: "CYS Draft Night Draft Hub",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen flex flex-col">
          {/* Keep your existing nav; this is where role/login UI likely lives */}
          <TopNav session={session as any} />

          {/* Subtle background + centered content */}
          <main className="flex-1">
            <div className="mx-auto w-full max-w-6xl px-4 py-8">
              <div className="rounded-2xl border bg-card shadow-sm">
                <div className="p-6 sm:p-8">{children}</div>
              </div>
            </div>
          </main>

          <footer className="mx-auto w-full max-w-6xl px-4 pb-10 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>© {new Date().getFullYear()} CYS Draft Hub</span>
              <span className="hidden sm:inline">Internal tool for draft night operations</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
