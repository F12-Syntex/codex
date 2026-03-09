import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import pdfParse from "pdf-parse";

export interface BookChapter {
  title: string;
  /** Plain text paragraphs (for TTS) */
  paragraphs: string[];
  /** Raw HTML paragraphs (for native rendering with drop caps, etc.) */
  htmlParagraphs: string[];
}

export interface TocEntry {
  label: string;
  /** Index into the chapters array (0-based, excludes the TOC chapter itself) */
  chapterIndex: number;
}

export interface BookContent {
  chapters: BookChapter[];
  /** For CBZ: chapters contain base64 image URIs instead of text */
  isImageBook: boolean;
  /** Custom table of contents built from NCX/NAV skeleton or inferred from chapters */
  toc: TocEntry[];
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

/** Case-insensitive fallback for zip entry lookup */
function findEntryCaseInsensitive(zip: AdmZip, entryPath: string): AdmZip.IZipEntry | null {
  const lower = entryPath.toLowerCase();
  for (const entry of zip.getEntries()) {
    if (entry.entryName.toLowerCase() === lower) return entry;
  }
  return null;
}

/** Look up a ZIP entry trying several path variants */
function getZipEntry(zip: AdmZip, entryPath: string): AdmZip.IZipEntry | null {
  return (
    zip.getEntry(entryPath) ||
    zip.getEntry(decodeURIComponent(entryPath)) ||
    zip.getEntry(encodeURIComponent(entryPath).replace(/%2F/g, "/")) ||
    findEntryCaseInsensitive(zip, entryPath) ||
    findEntryCaseInsensitive(zip, decodeURIComponent(entryPath)) ||
    null
  );
}

/** Convert SVG <image xlink:href="..."> blocks to plain <img src="data:..."> tags.
 *  Many publishers (Yen Press, J-Novel Club, etc.) wrap full-page images in SVG.
 *  Must be called BEFORE sanitizeHtml (which strips SVG entirely). */
function preprocessSvgImages(xhtml: string, zip: AdmZip, chapterDir: string): string {
  return xhtml.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, (svgBlock) => {
    // Extract ALL <image> tags (publishers sometimes include multiple per SVG)
    const imgTags: string[] = [];
    const imageRegex = /\b(?:xlink:href|href)=["'](?!data:)([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = imageRegex.exec(svgBlock)) !== null) {
      const src = m[1];
      const decoded = decodeURIComponent(src);
      const entryPath = resolveRelativePath(chapterDir, decoded);
      const entry =
        getZipEntry(zip, entryPath) ||
        getZipEntry(zip, decoded) ||
        getZipEntry(zip, src);
      if (entry) {
        imgTags.push(`<img src="${bufferToDataUri(entry.getData(), decoded)}"/>`);
      }
    }
    // If we found images, replace SVG block with them; otherwise remove the block
    return imgTags.length > 0 ? imgTags.join("\n") : "";
  });
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
 *  chapterDir is the directory of the XHTML file within the ZIP (for image resolution).
 *
 *  Strategy: resolve ALL images/SVGs on the full body HTML first, sanitize once,
 *  then split into blocks by <p> boundaries. Content between <p> tags (images,
 *  figures, divs, etc.) becomes its own block — nothing is dropped. */
function extractParagraphs(xhtml: string, zip?: AdmZip, chapterDir?: string): { plain: string[]; html: string[] } {
  const plain: string[] = [];
  const html: string[] = [];

  // 1. Convert SVG <image> blocks to <img> tags
  let processed = zip && chapterDir != null
    ? preprocessSvgImages(xhtml, zip, chapterDir)
    : xhtml;

  // 2. Extract body content
  const bodyMatch = processed.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = bodyMatch ? bodyMatch[1] : processed;

  // 3. Resolve ALL <img> src paths to data URIs in one pass
  if (zip && chapterDir != null) {
    content = resolveImages(content, zip, chapterDir);
  }

  // 4. Sanitize the entire content at once
  content = sanitizeHtml(content);

  // 5. Split into blocks using <p> tags as boundaries.
  //    Gaps between <p> tags (images, figures, any HTML) become their own blocks.
  const pRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const segments: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = pRegex.exec(content)) !== null) {
    const gap = content.slice(lastIndex, m.index).trim();
    if (gap) segments.push(gap);
    segments.push(m[0]);
    lastIndex = m.index + m[0].length;
  }
  const tail = content.slice(lastIndex).trim();
  if (tail) segments.push(tail);

  for (const segment of segments) {
    const text = stripHtml(segment).trim();
    const hasImage = /<img\b/i.test(segment);
    if (!text && !hasImage) continue;

    plain.push(text || "[image]");
    html.push(segment);
  }

  // Fallback: if we got nothing, treat entire content as one block
  if (html.length === 0 && content.trim()) {
    const text = stripHtml(content).trim();
    if (text || /<img\b/i.test(content)) {
      plain.push(text || "[image]");
      html.push(content.trim());
    }
  }

  // Post-process: split wall-of-text paragraphs that lack line breaks.
  // Many raw-translated EPUBs dump entire chapters into a single <p> or <div>.
  const splitPlain: string[] = [];
  const splitHtml: string[] = [];

  for (let i = 0; i < html.length; i++) {
    const h = html[i];
    const p = plain[i];

    // 1. Split on <br> tags first — treat them as paragraph separators
    if (/<br\s*\/?>/i.test(h)) {
      const parts = h.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        const text = stripHtml(part).trim();
        if (!text && !/<img\b/i.test(part)) continue;
        splitPlain.push(text || "[image]");
        splitHtml.push(`<p>${part}</p>`);
      }
      continue;
    }

    // 2. If the plain text is very long (>1500 chars), split on double-newlines
    //    or sentence boundaries to create readable paragraphs
    if (p && p.length > 1500 && !/<img\b/i.test(h)) {
      // Try double-newline split first
      const nlParts = p.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      if (nlParts.length > 1) {
        for (const part of nlParts) {
          splitPlain.push(part);
          splitHtml.push(`<p>${part}</p>`);
        }
        continue;
      }

      // Fall back to splitting on sentence boundaries every ~500 chars
      const sentences = p.split(/(?<=[.!?。！？」』])\s+/);
      let buf = "";
      for (const s of sentences) {
        if (buf.length > 0 && buf.length + s.length > 500) {
          splitPlain.push(buf);
          splitHtml.push(`<p>${buf}</p>`);
          buf = s;
        } else {
          buf += (buf ? " " : "") + s;
        }
      }
      if (buf) {
        splitPlain.push(buf);
        splitHtml.push(`<p>${buf}</p>`);
      }
      continue;
    }

    // 3. Normal paragraph — keep as-is
    splitPlain.push(p);
    splitHtml.push(h);
  }

  return { plain: splitPlain, html: splitHtml };
}

/** Extract font-family, font-size, and raw CSS from EPUB CSS files */
function extractFontInfo(zip: AdmZip, opfXml: string, opfDir: string): { fontFamily?: string; fontSizePx?: number; css?: string } {
  // Find CSS files referenced in manifest
  const cssHrefs: string[] = [];
  const cssItemRegex = /<(?:\w+:)?item\b[^>]*?href=["']([^"']+\.css)["'][^>]*?\/?>/gi;
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

/** Parse OPF manifest: returns a map of id → href (handles any attribute order, single or double quotes, and XML namespace prefixes like opf:item) */
function parseManifest(opfXml: string): Map<string, string> {
  const manifest = new Map<string, string>();
  // Match <item> or <opf:item> (or any ns prefix)
  const itemTagRegex = /<(?:\w+:)?item\b([^>]+?)(?:\/>|>)/gi;
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

/** Parse OPF spine: returns ordered list of idref values (handles single or double quotes and XML namespace prefixes like opf:itemref) */
function parseSpine(opfXml: string): string[] {
  const ids: string[] = [];
  const spineItemRegex = /<(?:\w+:)?itemref\b[^>]*?idref=["']([^"']+)["'][^>]*?\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = spineItemRegex.exec(opfXml)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

/** Parse the NCX (EPUB 2) table of contents — returns a map of href → label */
function parseNcx(zip: AdmZip, opfXml: string, opfDir: string): Map<string, string> {
  const map = new Map<string, string>();

  // Find NCX item in manifest (media-type="application/x-dtbncx+xml")
  const ncxMatch = opfXml.match(/<(?:\w+:)?item\b[^>]*?media-type=["']application\/x-dtbncx\+xml["'][^>]*?\/?>/i);
  if (!ncxMatch) return map;

  const hrefMatch = ncxMatch[0].match(/\bhref=["']([^"']+)["']/i);
  if (!hrefMatch) return map;

  const ncxPath = resolveRelativePath(opfDir, decodeURIComponent(hrefMatch[1]));
  const entry = getZipEntry(zip, ncxPath);
  if (!entry) return map;

  const ncxXml = entry.getData().toString("utf-8");
  const ncxDir = path.posix.dirname(ncxPath);

  // Extract <navPoint> entries: <navLabel><text>TITLE</text></navLabel><content src="HREF"/>
  const navPointRegex = /<navPoint\b[^>]*>[\s\S]*?<\/navPoint>/gi;
  let m: RegExpExecArray | null;
  while ((m = navPointRegex.exec(ncxXml)) !== null) {
    const block = m[0];
    const textMatch = block.match(/<navLabel>\s*<text>([^<]*)<\/text>\s*<\/navLabel>/i);
    const srcMatch = block.match(/<content\b[^>]*?src=["']([^"']+)["']/i);
    if (textMatch && srcMatch) {
      const label = stripHtml(textMatch[1]).trim();
      // Normalize href: resolve relative to NCX dir, strip fragment
      const rawHref = decodeURIComponent(srcMatch[1]).split("#")[0];
      const resolved = resolveRelativePath(ncxDir, rawHref);
      if (label) map.set(resolved, label);
    }
  }
  return map;
}

/** Parse the EPUB 3 NAV document — returns a map of href → label */
function parseNav(zip: AdmZip, opfXml: string, opfDir: string): Map<string, string> {
  const map = new Map<string, string>();

  // Find NAV item in manifest (properties="nav")
  const navMatch = opfXml.match(/<(?:\w+:)?item\b[^>]*?properties=["'][^"']*\bnav\b[^"']*["'][^>]*?\/?>/i);
  if (!navMatch) return map;

  const hrefMatch = navMatch[0].match(/\bhref=["']([^"']+)["']/i);
  if (!hrefMatch) return map;

  const navPath = resolveRelativePath(opfDir, decodeURIComponent(hrefMatch[1]));
  const entry = getZipEntry(zip, navPath);
  if (!entry) return map;

  const navHtml = entry.getData().toString("utf-8");
  const navDir = path.posix.dirname(navPath);

  // Find <nav epub:type="toc"> section
  const tocNav = navHtml.match(/<nav\b[^>]*epub:type=["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
  if (!tocNav) return map;

  // Extract <a href="...">TITLE</a> entries
  const linkRegex = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(tocNav[1])) !== null) {
    const rawHref = decodeURIComponent(m[1]).split("#")[0];
    const label = stripHtml(m[2]).trim();
    const resolved = resolveRelativePath(navDir, rawHref);
    if (label) map.set(resolved, label);
  }
  return map;
}

/** Patterns that indicate a spine item is a TOC/nav page (by href or title) */
const TOC_HREF_PATTERNS = [/\btoc\b/i, /\bnav\b/i, /table.?of.?contents/i, /\bcontents\b/i];
const TOC_TITLE_PATTERNS = [/^(table\s+of\s+contents|contents|toc)$/i];

function isTocItem(href: string, title: string): boolean {
  const trimTitle = title.trim();
  if (TOC_TITLE_PATTERNS.some((p) => p.test(trimTitle))) return true;
  // Only match href if it's clearly a dedicated TOC file (not "introduction" etc.)
  const filename = href.split("/").pop()?.split(".")[0]?.toLowerCase() ?? "";
  return filename === "toc" || filename === "nav" || filename === "contents" || filename === "tableofcontents";
}

// ── EPUB Parser ──────────────────────────────────────

function parseEpubChapters(filePath: string): BookContent {
  console.log(`[book-parser] parseEpubChapters — opening "${filePath}"`);
  const zip = new AdmZip(filePath);
  console.log(`[book-parser] ZIP opened — ${zip.getEntries().length} entries`);

  // 1. Find OPF path via container.xml
  const containerEntry = zip.getEntry("META-INF/container.xml");
  if (!containerEntry) {
    console.error(`[book-parser] Missing META-INF/container.xml`);
    return { chapters: [{ title: "Error", paragraphs: ["Could not read EPUB: missing container.xml"], htmlParagraphs: ["<p>Could not read EPUB: missing container.xml</p>"] }], isImageBook: false, toc: [] };
  }

  const containerXml = containerEntry.getData().toString("utf-8");
  const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/);
  if (!rootfileMatch) {
    console.error(`[book-parser] No rootfile full-path in container.xml`);
    return { chapters: [{ title: "Error", paragraphs: ["Could not find OPF file in EPUB"], htmlParagraphs: ["<p>Could not find OPF file in EPUB</p>"] }], isImageBook: false, toc: [] };
  }

  const opfPath = rootfileMatch[1];
  const opfDir = path.posix.dirname(opfPath);
  console.log(`[book-parser] OPF path="${opfPath}", dir="${opfDir}"`);
  const opfEntry = getZipEntry(zip, opfPath);
  if (!opfEntry) {
    console.error(`[book-parser] OPF entry not found in ZIP: "${opfPath}"`);
    return { chapters: [{ title: "Error", paragraphs: ["Could not read OPF file"], htmlParagraphs: ["<p>Could not read OPF file</p>"] }], isImageBook: false, toc: [] };
  }

  const opfXml = opfEntry.getData().toString("utf-8");

  // 2. Build manifest map: id -> href (attribute-order-independent)
  const manifest = parseManifest(opfXml);

  // 3. Get spine order (handles single or double quotes)
  let spineIds = parseSpine(opfXml);

  console.log(`[book-parser] Initial spine parse: ${spineIds.length} ids, manifest: ${manifest.size} items`);
  // Fallback: if spine is empty, use all XHTML/HTML items from manifest in insertion order
  if (spineIds.length === 0) {
    for (const [id, href] of manifest) {
      if (/\.x?html?$/i.test(href)) {
        spineIds.push(id);
      }
    }
  }

  console.log(`[book-parser] Manifest: ${manifest.size} items, Spine: ${spineIds.length} items`);
  if (manifest.size === 0) {
    console.error(`[book-parser] DEBUG — OPF XML (first 3000 chars):\n${opfXml.slice(0, 3000)}`);
  }
  if (spineIds.length === 0 && manifest.size > 0) {
    // Spine parsing failed but manifest has items — dump spine section for debugging
    const spineMatch = opfXml.match(/<spine[\s\S]*?<\/spine>/i);
    console.error(`[book-parser] DEBUG — Spine section:\n${spineMatch?.[0] ?? "NOT FOUND"}`);
  }

  if (spineIds.length === 0) {
    console.error(`[book-parser] No spine items found`);
    return { chapters: [{ title: "Error", paragraphs: ["No chapters found in EPUB spine"], htmlParagraphs: ["<p>No chapters found in EPUB spine</p>"] }], isImageBook: false, toc: [] };
  }

  // 4. Parse NCX / NAV for chapter names (the "skeleton")
  const ncxTitles = parseNcx(zip, opfXml, opfDir);
  const navTitles = parseNav(zip, opfXml, opfDir);
  console.log(`[book-parser] NCX titles: ${ncxTitles.size}, NAV titles: ${navTitles.size}`);

  // 5. Extract each chapter
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

    // Title priority: NCX skeleton → NAV skeleton → extracted <title>/<h1> → generic
    const skeletonTitle = ncxTitles.get(entryPath) || navTitles.get(entryPath)
      || ncxTitles.get(decodedHref) || navTitles.get(decodedHref);
    const extractedTitle = extractTitle(xhtml);
    const title = skeletonTitle || extractedTitle || `Chapter ${chapterNum}`;

    // Skip built-in TOC pages — check both href and title
    if (isTocItem(entryPath, title)) continue;
    if (isTocItem(decodedHref, extractedTitle)) continue;

    chapters.push({ title, paragraphs: plain, htmlParagraphs: html });
  }

  if (chapters.length === 0) {
    return { chapters: [{ title: "Empty", paragraphs: ["This EPUB has no readable text content."], htmlParagraphs: ["<p>This EPUB has no readable text content.</p>"] }], isImageBook: false, toc: [] };
  }

  // Build TOC: try skeleton first, then fall back to chapter titles
  const toc: TocEntry[] = buildToc(chapters, ncxTitles, navTitles);

  // Insert a synthetic TOC chapter at position 0
  const tocChapter: BookChapter = {
    title: "Table of Contents",
    paragraphs: toc.map((e) => e.label),
    htmlParagraphs: toc.map((e) => `<p>${e.label}</p>`),
  };
  chapters.unshift(tocChapter);

  // Adjust TOC indices to account for the inserted TOC chapter
  for (const entry of toc) entry.chapterIndex += 1;

  // Extract font info and CSS from stylesheets
  const { fontFamily, fontSizePx, css } = extractFontInfo(zip, opfXml, opfDir);

  return { chapters, isImageBook: false, toc, fontFamily, fontSizePx, css };
}

/** Build TOC entries from NCX/NAV skeleton, falling back to chapter titles */
function buildToc(chapters: BookChapter[], ncxTitles: Map<string, string>, navTitles: Map<string, string>): TocEntry[] {
  // If we have skeleton data, use it to match against chapters
  const skeleton = ncxTitles.size > 0 ? ncxTitles : navTitles;

  if (skeleton.size > 0) {
    // Build ordered list from skeleton values (preserving nav order)
    const skeletonLabels = Array.from(skeleton.values());
    const toc: TocEntry[] = [];
    const used = new Set<number>();

    for (const label of skeletonLabels) {
      // Match skeleton label to chapter title
      const normalizedLabel = label.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
      let matchIndex = -1;

      for (let i = 0; i < chapters.length; i++) {
        if (used.has(i)) continue;
        const normalizedTitle = chapters[i].title.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
        if (normalizedTitle === normalizedLabel || normalizedTitle.includes(normalizedLabel) || normalizedLabel.includes(normalizedTitle)) {
          matchIndex = i;
          break;
        }
      }

      if (matchIndex !== -1) {
        used.add(matchIndex);
        toc.push({ label, chapterIndex: matchIndex });
      }
    }

    // If skeleton matched at least half the chapters, use it
    if (toc.length >= chapters.length * 0.5) return toc;
  }

  // Fallback: use chapter titles directly
  return chapters.map((ch, i) => ({ label: ch.title, chapterIndex: i }));
}

// ── CBZ Parser ───────────────────────────────────────

function parseCbzPages(filePath: string): BookContent {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries()
    .filter((e) => !e.isDirectory && isImageFile(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  if (entries.length === 0) {
    return { chapters: [{ title: "Empty", paragraphs: ["No images found in CBZ archive."], htmlParagraphs: ["<p>No images found in CBZ archive.</p>"] }], isImageBook: false, toc: [] };
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

  const toc: TocEntry[] = chapters.map((ch, i) => ({ label: ch.title, chapterIndex: i }));
  return { chapters, isImageBook: true, toc };
}

// ── PDF parser ───────────────────────────────────────

interface PdfPageData {
  getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
}

export async function parsePdfContent(filePath: string): Promise<BookContent> {
  const buffer = fs.readFileSync(filePath);
  const pageTexts: string[] = [];

  await pdfParse(buffer, {
    pagerender(pageData: PdfPageData) {
      return pageData.getTextContent().then((content) => {
        let text = "";
        let lastY: number | null = null;
        for (const item of content.items) {
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
          text += item.str;
          lastY = y;
        }
        pageTexts.push(text.trim());
        return text;
      });
    },
  });

  const chapters: BookChapter[] = pageTexts.map((pageText, i) => {
    const rawBlocks = pageText.split(/\n{2,}/);
    const paragraphs = rawBlocks
      .map((block) => block.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim())
      .filter((p) => p.length > 0);

    return {
      title: `Page ${i + 1}`,
      paragraphs: paragraphs.length > 0 ? paragraphs : [""],
      htmlParagraphs: paragraphs.length > 0 ? paragraphs.map((p) => `<p>${p}</p>`) : ["<p></p>"],
    };
  });

  if (chapters.length === 0) {
    chapters.push({
      title: "Page 1",
      paragraphs: ["This PDF contains no extractable text (it may be a scanned image PDF)."],
      htmlParagraphs: ["<p>This PDF contains no extractable text (it may be a scanned image PDF).</p>"],
    });
  }

  const toc: TocEntry[] = chapters.map((ch, i) => ({ label: ch.title, chapterIndex: i }));
  return { chapters, isImageBook: false, toc };
}

// ── Public API ───────────────────────────────────────

export function parseBookContent(filePath: string, format: string): BookContent {
  const fmt = format.toUpperCase();
  console.log(`[book-parser] parseBookContent called — format="${format}" (normalized="${fmt}"), filePath="${filePath}"`);

  try {
    let result: BookContent;

    switch (fmt) {
      case "EPUB":
        result = parseEpubChapters(filePath);
        break;
      case "CBZ":
      case "CBR":
        result = parseCbzPages(filePath);
        break;
      case "PDF":
        throw new Error("Use parsePdfContent() for PDF files (async).");
      default:
        console.error(`[book-parser] Unsupported format: "${format}"`);
        result = {
          chapters: [{
            title: "Unsupported Format",
            paragraphs: [`The format "${format}" is not yet supported for reading.`],
            htmlParagraphs: [`<p>The format "${format}" is not yet supported for reading.</p>`],
          }],
          isImageBook: false,
          toc: [],
        };
        break;
    }

    console.log(`[book-parser] Success — ${result.chapters.length} chapters, isImageBook=${result.isImageBook}`);
    if (result.chapters.length > 0 && result.chapters[0].title === "Error") {
      console.error(`[book-parser] Parser returned error chapter: "${result.chapters[0].paragraphs[0]}"`);
    }
    return result;
  } catch (err) {
    console.error(`[book-parser] EXCEPTION parsing "${filePath}":`, err);
    return {
      chapters: [{
        title: "Error",
        paragraphs: [`Failed to parse book: ${err instanceof Error ? err.message : String(err)}`],
        htmlParagraphs: [`<p>Failed to parse book: ${err instanceof Error ? err.message : String(err)}</p>`],
      }],
      isImageBook: false,
      toc: [],
    };
  }
}
