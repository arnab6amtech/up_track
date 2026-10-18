import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { McpGuide } from "@/components/mcp-guide";
import { AppHeaderContent, SignedInOnly } from "@/components/app-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "UpTrack — Bug tracker",
  description: "Track bugs across your organization's projects and versions, with screenshots, recordings and API logs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-accent text-sm text-white">U</span>
              <span className="hidden sm:inline">UpTrack</span>
            </Link>
            <div className="flex min-w-0 flex-1 justify-end">
              <Suspense fallback={null}>
                <AppHeaderContent />
              </Suspense>
            </div>
          </div>
        </header>
        {/* Bottom padding keeps the floating agent button from covering the end of the page. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6">{children}</main>
        <Suspense fallback={null}>
          <SignedInOnly>
            <McpGuide publicUrl={process.env.PUBLIC_URL?.trim().replace(/\/$/, "") || null} />
          </SignedInOnly>
        </Suspense>
      </body>
    </html>
  );
}
