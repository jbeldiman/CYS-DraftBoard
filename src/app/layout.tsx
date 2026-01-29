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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-b from-yellow-100 via-yellow-50 to-background`}
      >
        <div className="min-h-screen flex flex-col">
          <TopNav session={session as any} />

          <main className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div className="bg-white dark:bg-background rounded-2xl shadow-sm border border-black/5 p-4 sm:p-6"></div>
              {children}
              </div>
            </div>
          </main>

          <footer className="border-t bg-background/60 backdrop-blur">
            <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8 py-5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>{new Date().getFullYear()} CYS Draft Hub</span>
                <span className="hidden sm:inline">Draft Night Command Center</span>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
