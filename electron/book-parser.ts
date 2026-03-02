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

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];

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
    ".svg": "image/svg+xml",
  };
  const mime = mimeMap[ext] || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Sanitize HTML for safe rendering — neutralize links, remove unresolved images */
function sanitizeHtml(raw: string): string {
  return raw
    // Convert <a href="...">text</a> to just <span>text</span> (neutralize navigation)
    .replace(/<a\s[^>]*>/gi, "<span>")
    .replace(/<\/a>/gi, "</span>")
    // Keep <img> with data: URIs, remove ones with unresolved internal paths
    .replace(/<img\s+[^>]*src=["'](?!data:)[^"']*["'][^>]*\/?>/gi, "")
    // Remove <image> (SVG) tags with internal paths
    .replace(/<image\s+[^>]*(?:href|xlink:href)=["'](?!data:)[^"']*["'][^>]*\/?>/gi, "")
    // Remove <svg> blocks entirely (often used for decorative elements referencing internal files)
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");
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

/** Resolve a relative path against a base directory, handling ../ segments */
function resolveRelativePath(base: string, relative: string): string {
  // Absolute path within ZIP — strip leading slash
  if (relative.startsWith("/")) return relative.slice(1);
  if (base === "" || base === ".") return relative;
  const parts = `${base}/${relative}`.split("/");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "..") resolved.pop();
    else if (p !== "." && p !== "") resolved.push(p);
  }
  return resolved.join("/");
}

/** Look up a ZIP entry trying several path variants */
function getZipEntry(zip: AdmZip, entryPath: string): AdmZip.IZipEntry | null {
  return (
    zip.getEntry(entryPath) ||
    zip.getEntry(decodeURIComponent(entryPath)) ||
    zip.getEntry(encodeURIComponent(entryPath).replace(/%2F/g, "/")) ||
    null
  );
}

/** Resolve <img src="..."> in HTML to inline data URIs using the EPUB zip.
 *  chapterDir should be the directory of the XHTML file, not the OPF. */
function resolveImages(html: string, zip: AdmZip, chapterDir: string): string {
  return html.replace(
    /<img\b([^>]*?)src=["'](?!data:)([^"']+)["']([^>]*?)\/?>/gi,
    (_match, pre, src, post) => {
      const decoded = decodeURIComponent(src);
      // Resolve relative to the chapter file's directory
      const entryPath = resolveRelativePath(chapterDir, decoded);
      const entry =
        getZipEntry(zip, entryPath) ||
        getZipEntry(zip, decoded) ||
        getZipEntry(zip, src);
      if (!entry) return ""; // image not found, remove tag
      const dataUri = bufferToDataUri(entry.getData(), decoded);
      return `<img ${pre}src="${dataUri}"${post}/>`;
    }
  );
}

/** Extract paragraphs and images from XHTML content — returns { plain, html } arrays.
 *  chapterDir is the directory of the XHTML file within the ZIP (for image resolution). */
function extractParagraphs(xhtml: string, zip?: AdmZip, chapterDir?: string): { plain: string[]; html: string[] } {
  const plain: string[] = [];
  const html: string[] = [];

  // Remove head section
  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = bodyMatch ? bodyMatch[1] : xhtml;

  // Match <p>, <img>, and <div> with images — in document order
  const blockRegex = /<(?:p|img|div)[^>]*>(?:[\s\S]*?<\/(?:p|div)>)?/gi;
  const blocks = content.match(blockRegex);

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      const isImg = /^<img\b/i.test(block.trim());
      const hasImg = /<img\b/i.test(block);

      if (isImg) {
        // Standalone <img> tag — resolve to data URI
        const resolved = zip && chapterDir != null ? resolveImages(block, zip, chapterDir) : block;
        if (resolved.trim()) {
          plain.push("[image]");
          html.push(resolved.trim());
        }
      } else if (/^<p\b/i.test(block.trim())) {
        const text = stripHtml(block).trim();
        let htmlBlock = text.length > 0 ? block.trim() : "<p></p>";
        // Resolve images BEFORE sanitizing — sanitize strips unresolved src paths
        if (hasImg && zip && chapterDir != null) {
          htmlBlock = resolveImages(htmlBlock, zip, chapterDir);
        }
        htmlBlock = sanitizeHtml(htmlBlock);
        plain.push(text);
        html.push(htmlBlock);
      } else if (/^<div\b/i.test(block.trim()) && hasImg) {
        // Div containing an image — resolve first, then sanitize
        let resolved = zip && chapterDir != null ? resolveImages(block, zip, chapterDir) : block;
        resolved = sanitizeHtml(resolved);
        if (resolved.trim()) {
          plain.push("[image]");
          html.push(resolved.trim());
        }
      }
    }
  }

  // Fallback: if we got nothing, try the old <p>-only approach
  if (html.length === 0) {
    const pMatches = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
    if (pMatches && pMatches.length > 0) {
      for (const p of pMatches) {
        const text = stripHtml(p).trim();
        plain.push(text);
        html.push(text.length > 0 ? sanitizeHtml(p.trim()) : "<p></p>");
      }
    }
  }

  // If still nothing, try divs
  if (html.length === 0) {
    const divMatches = content.match(/<div[^>]*>[\s\S]*?<\/div>/gi);
    if (divMatches) {
      for (const d of divMatches) {
        const text = stripHtml(d).trim();
        if (text.length > 0) {
          plain.push(text);
          html.push(sanitizeHtml(d.trim()));
        }
      }
    }
  }

  // Last resort: strip all tags, split by double newlines
  if (html.length === 0) {
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
  const cssItemRegex = /<item\b[^>]*?href=["']([^"']+\.css)["'][^>]*?\/?>/gi;
  let cssMatch: RegExpExecArray | null;
  while ((cssMatch = cssItemRegex.exec(opfXml)) !== null) {
    cssHrefs.push(cssMatch[1]);
  }

  let fontFamily: string | undefined;
  let fontSizePx: number | undefined;
  const cssChunks: string[] = [];

  for (const href of cssHrefs) {
    const entryPath = resolveRelativePath(opfDir, href);
    const entry = getZipEntry(zip, entryPath) || getZipEntry(zip, href);
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

/** Parse OPF manifest: returns a map of id → href (handles any attribute order, single or double quotes) */
function parseManifest(opfXml: string): Map<string, string> {
  const manifest = new Map<string, string>();
  // Match each <item .../> or <item ...> tag
  const itemTagRegex = /<item\b([^>]+?)(?:\/>|>)/gi;
  let m: RegExpExecArray | null;
  while ((m = itemTagRegex.exec(opfXml)) !== null) {
    const attrs = m[1];
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
    const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i);
    if (idMatch && hrefMatch) {
      manifest.set(idMatch[1], hrefMatch[1]);
    }
  }
  return manifest;
}

/** Parse OPF spine: returns ordered list of idref values (handles single or double quotes) */
function parseSpine(opfXml: string): string[] {
  const ids: string[] = [];
  const spineItemRegex = /<itemref\b[^>]*?idref=["']([^"']+)["'][^>]*?\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = spineItemRegex.exec(opfXml)) !== null) {
    ids.push(m[1]);
  }
  return ids;
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
  const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/);
  if (!rootfileMatch) {
    return { chapters: [{ title: "Error", paragraphs: ["Could not find OPF file in EPUB"], htmlParagraphs: ["<p>Could not find OPF file in EPUB</p>"] }], isImageBook: false };
  }

  const opfPath = rootfileMatch[1];
  const opfDir = path.posix.dirname(opfPath);
  const opfEntry = getZipEntry(zip, opfPath);
  if (!opfEntry) {
    return { chapters: [{ title: "Error", paragraphs: ["Could not read OPF file"], htmlParagraphs: ["<p>Could not read OPF file</p>"] }], isImageBook: false };
  }

  const opfXml = opfEntry.getData().toString("utf-8");

  // 2. Build manifest map: id -> href (attribute-order-independent)
  const manifest = parseManifest(opfXml);

  // 3. Get spine order (handles single or double quotes)
  let spineIds = parseSpine(opfXml);

  // Fallback: if spine is empty, use all XHTML/HTML items from manifest in insertion order
  if (spineIds.length === 0) {
    for (const [id, href] of manifest) {
      if (/\.x?html?$/i.test(href)) {
        spineIds.push(id);
      }
    }
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

    const decodedHref = decodeURIComponent(href);
    const entryPath = opfDir === "." ? decodedHref : `${opfDir}/${decodedHref}`;
    const entry =
      getZipEntry(zip, entryPath) ||
      getZipEntry(zip, decodedHref) ||
      getZipEntry(zip, href);
    if (!entry) continue;

    const xhtml = entry.getData().toString("utf-8");

    // Derive chapter directory for image resolution (relative to chapter, not OPF)
    const chapterDir = path.posix.dirname(entryPath);

    const { plain, html } = extractParagraphs(xhtml, zip, chapterDir);

    // Skip truly empty chapters (no text, no images)
    if (plain.length === 0) continue;

    chapterNum++;
    const title = extractTitle(xhtml) || `Chapter ${chapterNum}`;

    // Skip the EPUB's built-in table of contents page — we render our own
    if (/^(table\s+of\s+contents|contents|toc)$/i.test(title.trim())) continue;

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
