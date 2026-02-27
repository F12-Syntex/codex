import AdmZip from "adm-zip";
import path from "path";

export interface BookChapter {
  title: string;
  /** Plain text paragraphs (for TTS) */
  paragraphs: string[];
  /** Raw HTML paragraphs (for native rendering with drop caps, etc.) */
  htmlParagraphs: string[];
}

export interface BookContent {
  chapters: BookChapter[];
  /** For CBZ: chapters contain base64 image URIs instead of text */
  isImageBook: boolean;
  /** Native font family from the book's CSS (if found) */
  fontFamily?: string;
  /** Native font size from the book's CSS in px (if found) */
  fontSizePx?: number;
  /** Concatenated CSS from the book's stylesheets */
  css?: string;
}

// ── Helpers ──────────────────────────────────────────

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

function bufferToDataUri(buffer: Buffer, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const mime = mimeMap[ext] || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .trim();
}

/** Extract a chapter title from XHTML content */
function extractTitle(xhtml: string): string {
  // Try <title>
  const titleTag = xhtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag) {
    const t = stripHtml(titleTag[1]).trim();
    if (t && t.toLowerCase() !== "untitled" && t.length < 200) return t;
  }
  // Try <h1> or <h2>
  const headingMatch = xhtml.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  if (headingMatch) {
    const t = stripHtml(headingMatch[1]).trim();
    if (t && t.length < 200) return t;
  }
  return "";
}

/** Extract paragraphs from XHTML content — returns { plain, html } arrays */
function extractParagraphs(xhtml: string): { plain: string[]; html: string[] } {
  const plain: string[] = [];
  const html: string[] = [];

  // Remove head section
  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : xhtml;

  // Split on <p> tags
  const pMatches = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (pMatches && pMatches.length > 0) {
    for (const p of pMatches) {
      const text = stripHtml(p).trim();
      if (text.length > 0) {
        plain.push(text);
        html.push(p.trim());
      }
    }
  }

  // If no <p> tags, try splitting on <div> tags
  if (plain.length === 0) {
    const divMatches = content.match(/<div[^>]*>[\s\S]*?<\/div>/gi);
    if (divMatches) {
      for (const d of divMatches) {
        const text = stripHtml(d).trim();
        if (text.length > 0) {
          plain.push(text);
          html.push(d.trim());
        }
      }
    }
  }

  // Last resort: strip all tags, split by double newlines
  if (plain.length === 0) {
    const stripped = stripHtml(content);
    const lines = stripped.split(/\n\s*\n/).map((l) => l.trim()).filter(Boolean);
    plain.push(...lines);
    html.push(...lines.map((l) => `<p>${l}</p>`));
  }

  return { plain, html };
}

/** Extract font-family, font-size, and raw CSS from EPUB CSS files */
function extractFontInfo(zip: AdmZip, opfXml: string, opfDir: string): { fontFamily?: string; fontSizePx?: number; css?: string } {
  // Find CSS files referenced in manifest
  const cssHrefs: string[] = [];
  const cssItemRegex = /<item\s[^>]*?href="([^"]+\.css)"[^>]*?\/?>/gi;
  let cssMatch: RegExpExecArray | null;
  while ((cssMatch = cssItemRegex.exec(opfXml)) !== null) {
    cssHrefs.push(cssMatch[1]);
  }

  let fontFamily: string | undefined;
  let fontSizePx: number | undefined;
  const cssChunks: string[] = [];

  for (const href of cssHrefs) {
    const entryPath = opfDir === "." ? href : `${opfDir}/${href}`;
    const entry = zip.getEntry(entryPath) || zip.getEntry(decodeURIComponent(entryPath));
    if (!entry) continue;

    const css = entry.getData().toString("utf-8");
    cssChunks.push(css);

    // Look for body or p font-family
    if (!fontFamily) {
      const bodyBlock = css.match(/(?:body|p)\s*\{[^}]*font-family\s*:\s*([^;}]+)/i);
      if (bodyBlock) {
        const raw = bodyBlock[1].trim().replace(/["']/g, "");
        const first = raw.split(",")[0].trim();
        if (first && !first.match(/^(serif|sans-serif|monospace|cursive|fantasy|inherit|initial)$/i)) {
          fontFamily = raw;
        }
      }
    }

    // Look for body or p font-size
    if (!fontSizePx) {
      const sizeMatch = css.match(/(?:body|p)\s*\{[^}]*font-size\s*:\s*([^;}]+)/i);
      if (sizeMatch) {
        const val = sizeMatch[1].trim();
        const pxMatch = val.match(/^([\d.]+)\s*px$/i);
        const ptMatch = val.match(/^([\d.]+)\s*pt$/i);
        const emMatch = val.match(/^([\d.]+)\s*(?:em|rem)$/i);
        if (pxMatch) {
          fontSizePx = parseFloat(pxMatch[1]);
        } else if (ptMatch) {
          fontSizePx = Math.round(parseFloat(ptMatch[1]) * 1.333);
        } else if (emMatch) {
          fontSizePx = Math.round(parseFloat(emMatch[1]) * 16);
        }
      }
    }
  }

  const fullCss = cssChunks.length > 0 ? cssChunks.join("\n") : undefined;
  return { fontFamily, fontSizePx, css: fullCss };
}

// ── EPUB Parser ──────────────────────────────────────

function parseEpubChapters(filePath: string): BookContent {
  const zip = new AdmZip(filePath);

  // 1. Find OPF path via container.xml
  const containerEntry = zip.getEntry("META-INF/container.xml");
  if (!containerEntry) {
    return { chapters: [{ title: "Error", paragraphs: ["Could not read EPUB: missing container.xml"], htmlParagraphs: ["<p>Could not read EPUB: missing container.xml</p>"] }], isImageBook: false };
  }

  const containerXml = containerEntry.getData().toString("utf-8");
  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) {
    return { chapters: [{ title: "Error", paragraphs: ["Could not find OPF file in EPUB"], htmlParagraphs: ["<p>Could not find OPF file in EPUB</p>"] }], isImageBook: false };
  }

  const opfPath = rootfileMatch[1];
  const opfDir = path.posix.dirname(opfPath);
  const opfEntry = zip.getEntry(opfPath);
  if (!opfEntry) {
    return { chapters: [{ title: "Error", paragraphs: ["Could not read OPF file"], htmlParagraphs: ["<p>Could not read OPF file</p>"] }], isImageBook: false };
  }

  const opfXml = opfEntry.getData().toString("utf-8");

  // 2. Build manifest map: id -> href
  const manifest = new Map<string, string>();
  const itemRegex = /<item\s[^>]*?id="([^"]+)"[^>]*?href="([^"]+)"[^>]*?\/?>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    manifest.set(itemMatch[1], itemMatch[2]);
  }

  // 3. Get spine order
  const spineIds: string[] = [];
  const spineItemRegex = /<itemref\s[^>]*?idref="([^"]+)"[^>]*?\/?>/gi;
  let spineMatch: RegExpExecArray | null;
  while ((spineMatch = spineItemRegex.exec(opfXml)) !== null) {
    spineIds.push(spineMatch[1]);
  }

  if (spineIds.length === 0) {
    return { chapters: [{ title: "Error", paragraphs: ["No chapters found in EPUB spine"], htmlParagraphs: ["<p>No chapters found in EPUB spine</p>"] }], isImageBook: false };
  }

  // 4. Extract each chapter
  const chapters: BookChapter[] = [];
  let chapterNum = 0;

  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;

    const entryPath = opfDir === "." ? href : `${opfDir}/${href}`;
    const entry = zip.getEntry(entryPath) || zip.getEntry(decodeURIComponent(entryPath));
    if (!entry) continue;

    const xhtml = entry.getData().toString("utf-8");
    const { plain, html } = extractParagraphs(xhtml);

    // Skip empty chapters (like cover pages with only images)
    if (plain.length === 0) continue;

    chapterNum++;
    const title = extractTitle(xhtml) || `Chapter ${chapterNum}`;
    chapters.push({ title, paragraphs: plain, htmlParagraphs: html });
  }

  if (chapters.length === 0) {
    return { chapters: [{ title: "Empty", paragraphs: ["This EPUB has no readable text content."], htmlParagraphs: ["<p>This EPUB has no readable text content.</p>"] }], isImageBook: false };
  }

  // Extract font info and CSS from stylesheets
  const { fontFamily, fontSizePx, css } = extractFontInfo(zip, opfXml, opfDir);

  return { chapters, isImageBook: false, fontFamily, fontSizePx, css };
}

// ── CBZ Parser ───────────────────────────────────────

function parseCbzPages(filePath: string): BookContent {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries()
    .filter((e) => !e.isDirectory && isImageFile(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  if (entries.length === 0) {
    return { chapters: [{ title: "Empty", paragraphs: ["No images found in CBZ archive."], htmlParagraphs: ["<p>No images found in CBZ archive.</p>"] }], isImageBook: false };
  }

  // Group all pages into a single "chapter" for simplicity, or one chapter per ~20 pages
  const PAGES_PER_CHAPTER = 20;
  const chapters: BookChapter[] = [];

  for (let i = 0; i < entries.length; i += PAGES_PER_CHAPTER) {
    const slice = entries.slice(i, i + PAGES_PER_CHAPTER);
    const chapterIndex = Math.floor(i / PAGES_PER_CHAPTER) + 1;
    const pages = slice.map((entry) => bufferToDataUri(entry.getData(), entry.entryName));

    chapters.push({
      title: entries.length <= PAGES_PER_CHAPTER
        ? "All Pages"
        : `Pages ${i + 1}–${Math.min(i + PAGES_PER_CHAPTER, entries.length)}`,
      paragraphs: pages,
      htmlParagraphs: pages,
    });
  }

  return { chapters, isImageBook: true };
}

// ── Public API ───────────────────────────────────────

export function parseBookContent(filePath: string, format: string): BookContent {
  const fmt = format.toUpperCase();

  switch (fmt) {
    case "EPUB":
      return parseEpubChapters(filePath);
    case "CBZ":
    case "CBR":
      return parseCbzPages(filePath);
    case "PDF":
      return {
        chapters: [{
          title: "PDF Viewer",
          paragraphs: ["PDF reading is not yet supported. Please use an external PDF reader."],
          htmlParagraphs: ["<p>PDF reading is not yet supported. Please use an external PDF reader.</p>"],
        }],
        isImageBook: false,
      };
    default:
      return {
        chapters: [{
          title: "Unsupported Format",
          paragraphs: [`The format "${format}" is not yet supported for reading.`],
          htmlParagraphs: [`<p>The format "${format}" is not yet supported for reading.</p>`],
        }],
        isImageBook: false,
      };
  }
}
