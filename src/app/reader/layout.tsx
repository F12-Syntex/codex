import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { DEFAULT_READER_FONT } from "@shared/reader-fonts";
import { FONT_FACE_CSS } from "./lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function ReaderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} flex h-screen flex-col overflow-hidden antialiased select-none`}
    >
      {/* Reader typefaces (one registry: @shared/reader-fonts). The default face is preloaded. */}
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
      {DEFAULT_READER_FONT.files[0] && (
        <link rel="preload" as="font" type="font/woff2" crossOrigin="" href={`/fonts/${DEFAULT_READER_FONT.files[0].file}`} />
      )}
      {children}
    </div>
  );
}
