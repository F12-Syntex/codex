import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Display serif — feeds `--font-display` (globals.css). Keeps the optical-size axis. */
const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

/** UI sans fallback for non-Apple platforms — feeds `--font-ui`. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Codex",
  description: "Codex — a quiet library for your books and manga",
  icons: { icon: "/codex-logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme attributes (data-accent / data-appearance / data-tint, color-scheme)
  // are mirrored onto <html> at runtime by the main window, so portals inherit them.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} ${inter.variable}`}
    >
      <body className="bg-canvas font-sans text-sm text-label antialiased select-none">
        <div className="flex h-screen flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
