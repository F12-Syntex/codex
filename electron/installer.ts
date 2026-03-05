import { BrowserWindow, net } from "electron";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { app } from "electron";

// ── Types ────────────────────────────────────────────────

export interface NovelSearchResult {
  title: string;
  url: string;
  slug: string;
  thumbnail: string;
  author: string;
}

export interface NovelInfo {
  title: string;
  author: string;
  genres: string[];
  status: string;
  rating: string;
  description: string;
  thumbnail: string;
  totalChapters: number;
  chapters: { title: string; url: string }[];
}

export interface DownloadProgress {
  current: number;
  total: number;
  chapterTitle: string;
}

// ── Abort controller for cancellation ────────────────────

let abortController: AbortController | null = null;

// ── Helpers ──────────────────────────────────────────────

const BASE_URL = "https://novelfull.net";

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const resp = await net.fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: signal as never,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}

// ── Search ───────────────────────────────────────────────

export async function searchNovels(keyword: string, page: number = 1): Promise<{ results: NovelSearchResult[]; page: number; totalPages: number }> {
  const url = `${BASE_URL}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const results: NovelSearchResult[] = [];
  $(".list-truyen .row").each((_i, el) => {
    const titleEl = $(el).find("h3.truyen-title a");
    const title = titleEl.text().trim();
    const href = titleEl.attr("href") || "";
    const thumbnail = $(el).find("img").attr("src") || "";
    const author = $(el).find(".author").text().trim();

    if (title && href) {
      results.push({
        title,
        url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
        slug: href.replace(/^\//, ""),
        thumbnail: thumbnail.startsWith("http") ? thumbnail : `${BASE_URL}${thumbnail}`,
        author,
      });
    }
  });

  // Parse pagination
  let totalPages = 1;
  const lastPageLink = $(".pagination li:last-child a").attr("href");
  if (lastPageLink) {
    const match = lastPageLink.match(/page=(\d+)/);
    if (match) totalPages = parseInt(match[1], 10);
  }
  // Also check active page neighbors
  $(".pagination li a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/page=(\d+)/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (p > totalPages) totalPages = p;
    }
  });

  return { results, page, totalPages };
}

// ── Novel Info ───────────────────────────────────────────

export async function getNovelInfo(novelUrl: string): Promise<NovelInfo> {
  const html = await fetchHtml(novelUrl);
  const $ = cheerio.load(html);

  const title = $("h3.title").text().trim();
  const thumbnail = $(".book img").attr("src") || "";
  const author = $(".info a[href*='/author/']").first().text().trim()
    || $(".info div:contains('Author')").text().replace("Author:", "").trim();

  const genres: string[] = [];
  $(".info a[href*='/genre/']").each((_i, el) => {
    genres.push($(el).text().trim());
  });

  const status = $(".info div:contains('Status')").text().replace("Status:", "").trim()
    || $(".info a[href*='/status/']").text().trim();

  const rating = $("div[itemtype*='AggregateRating'] span[itemprop='ratingValue']").text().trim()
    || $(".small").first().text().trim()
    || "N/A";

  const description = $(".desc-text").text().trim()
    || $("div[itemprop='description']").text().trim();

  // Fetch all chapter pages
  const chapters: { title: string; url: string }[] = [];

  // Get total chapter pages from pagination
  let totalChapterPages = 1;
  const pageNavLinks = $("#list-chapter .pagination li a");
  pageNavLinks.each((_i, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/page[_-]?(\d+)/i) || href.match(/\?page=(\d+)/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (p > totalChapterPages) totalChapterPages = p;
    }
  });

  // Parse first page chapters
  $("#list-chapter .row a").each((_i, el) => {
    const chTitle = $(el).text().trim();
    const chHref = $(el).attr("href") || "";
    if (chTitle && chHref) {
      chapters.push({
        title: chTitle,
        url: chHref.startsWith("http") ? chHref : `${BASE_URL}${chHref}`,
      });
    }
  });

  // Fetch remaining chapter pages
  for (let p = 2; p <= totalChapterPages; p++) {
    const sep = novelUrl.includes("?") ? "&" : "?";
    const pageUrl = `${novelUrl}${sep}page=${p}`;
    try {
      const pageHtml = await fetchHtml(pageUrl);
      const $p = cheerio.load(pageHtml);
      $p("#list-chapter .row a").each((_i, el) => {
        const chTitle = $p(el).text().trim();
        const chHref = $p(el).attr("href") || "";
        if (chTitle && chHref) {
          chapters.push({
            title: chTitle,
            url: chHref.startsWith("http") ? chHref : `${BASE_URL}${chHref}`,
          });
        }
      });
    } catch {
      // Skip failed chapter page
    }
  }

  return {
    title,
    author,
    genres,
    status,
    rating,
    description,
    thumbnail: thumbnail.startsWith("http") ? thumbnail : `${BASE_URL}${thumbnail}`,
    totalChapters: chapters.length,
    chapters,
  };
}

// ── Download + EPUB generation ───────────────────────────

export async function downloadNovel(
  novelInfo: NovelInfo,
  sender: Electron.WebContents,
): Promise<string> {
  abortController = new AbortController();
  const { signal } = abortController;

  const chapterContents: { title: string; html: string }[] = [];
  const total = novelInfo.chapters.length;

  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw new Error("Download cancelled");

    const ch = novelInfo.chapters[i];
    sender.send("installer:download-progress", {
      current: i + 1,
      total,
      chapterTitle: ch.title,
    } satisfies DownloadProgress);

    try {
      const html = await fetchHtml(ch.url, signal);
      const $ = cheerio.load(html);

      // Extract chapter text content
      const contentEl = $("#chapter-content") || $(".chapter-c");
      // Remove ads and scripts
      contentEl.find("script, .ads, .adsbygoogle, ins, [id*='ads'], [class*='ads']").remove();
      const chapterHtml = contentEl.html()?.trim() || "<p>Content unavailable</p>";

      chapterContents.push({ title: ch.title, html: chapterHtml });
    } catch (err) {
      if (signal.aborted) throw new Error("Download cancelled");
      chapterContents.push({ title: ch.title, html: "<p>Failed to load chapter</p>" });
    }

    // Small delay to avoid rate limiting
    if (i < total - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Build EPUB
  const epubPath = buildEpub(novelInfo, chapterContents);
  abortController = null;
  return epubPath;
}

export function cancelDownload(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

// ── EPUB Builder (using adm-zip) ─────────────────────────

function buildEpub(info: NovelInfo, chapters: { title: string; html: string }[]): string {
  const zip = new AdmZip();

  // mimetype must be first entry and uncompressed
  zip.addFile("mimetype", Buffer.from("application/epub+zip"), "", 0);

  // META-INF/container.xml
  zip.addFile("META-INF/container.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`));

  // Build chapter files
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const tocEntries: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const id = `ch${i + 1}`;
    const filename = `${id}.xhtml`;

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(chapters[i].title)}</title></head>
<body>
<h1>${escapeXml(chapters[i].title)}</h1>
${chapters[i].html}
</body>
</html>`;

    zip.addFile(`OEBPS/${filename}`, Buffer.from(xhtml));
    manifestItems.push(`    <item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`    <itemref idref="${id}"/>`);
    tocEntries.push(`    <navPoint id="nav-${id}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(chapters[i].title)}</text></navLabel>
      <content src="${filename}"/>
    </navPoint>`);
  }

  // content.opf
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(info.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(info.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">novelfull-${sanitizeFilename(info.title)}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineItems.join("\n")}
  </spine>
</package>`;
  zip.addFile("OEBPS/content.opf", Buffer.from(opf));

  // toc.ncx
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="novelfull-${sanitizeFilename(info.title)}"/>
  </head>
  <docTitle><text>${escapeXml(info.title)}</text></docTitle>
  <navMap>
${tocEntries.join("\n")}
  </navMap>
</ncx>`;
  zip.addFile("OEBPS/toc.ncx", Buffer.from(ncx));

  // Write to downloads folder
  const downloadsDir = path.join(app.getPath("userData"), "downloads");
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  const filename = `${sanitizeFilename(info.title)}.epub`;
  const outputPath = path.join(downloadsDir, filename);
  zip.writeZip(outputPath);

  return outputPath;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
