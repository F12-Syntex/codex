import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Codex",
  description: "Codex — a quiet library for your books and manga",
  icons: { icon: "/codex-logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-canvas font-sans text-sm text-label antialiased select-none`}
      >
        <div className="flex h-screen flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
