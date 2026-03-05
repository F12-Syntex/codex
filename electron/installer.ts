import { net, BrowserWindow } from "electron";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";
import { app } from "electron";
import {
  addDownload, updateDownloadProgress, updateDownloadStatus,
  getDownload, getDownloads, type InstallerDownloadRow,
} from "./database";

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

export interface DownloadProgressEvent {
  id: number;
  current: number;
  total: number;
  chapterTitle: string;
  eta: number | null;
  status: string;
}

export interface NovelSource {
  id: string;
  name: string;
  url: string;
  search: (keyword: string, page: number) => Promise<{ results: NovelSearchResult[]; page: number; totalPages: number }>;
  getInfo: (novelUrl: string) => Promise<NovelInfo>;
  getChapterContent: (chapterUrl: string, signal?: AbortSignal) => Promise<string>;
}

// ── Helpers ──────────────────────────────────────────────

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

function resolveUrl(base: string, href: string): string {
  return href.startsWith("http") ? href : `${base}${href}`;
}

// ── Image proxy (convert external URL → base64 data URI) ─

export async function fetchImageAsDataUrl(url: string): Promise<string> {
  try {
    const resp = await net.fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!resp.ok) return "";
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await resp.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

// ── Source: NovelFull ─────────────────────────────────────

const NOVELFULL_BASE = "https://novelfull.net";

const novelfullSource: NovelSource = {
  id: "novelfull",
  name: "NovelFull",
  url: NOVELFULL_BASE,

  async search(keyword, page = 1) {
    const url = `${NOVELFULL_BASE}/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
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
          url: resolveUrl(NOVELFULL_BASE, href),
          slug: href.replace(/^\//, ""),
          thumbnail: resolveUrl(NOVELFULL_BASE, thumbnail),
          author,
        });
      }
    });

    let totalPages = 1;
    $(".pagination li a").each((_i, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/page=(\d+)/);
      if (match) {
        const p = parseInt(match[1], 10);
        if (p > totalPages) totalPages = p;
      }
    });

    return { results, page, totalPages };
  },

  async getInfo(novelUrl) {
    const html = await fetchHtml(novelUrl);
    const $ = cheerio.load(html);

    const title = $("h3.title").text().trim();
    const thumbnail = $(".book img").attr("src") || "";
    const author = $(".info a[href*='/author/']").first().text().trim()
      || $(".info div:contains('Author')").text().replace("Author:", "").trim();

    const genres: string[] = [];
    $(".info a[href*='/genre/']").each((_i, el) => { genres.push($(el).text().trim()); });

    const status = $(".info div:contains('Status')").text().replace("Status:", "").trim()
      || $(".info a[href*='/status/']").text().trim();

    const rating = $("div[itemtype*='AggregateRating'] span[itemprop='ratingValue']").text().trim()
      || $(".small").first().text().trim() || "N/A";

    const description = $(".desc-text").text().trim()
      || $("div[itemprop='description']").text().trim();

    const chapters: { title: string; url: string }[] = [];

    let totalChapterPages = 1;
    $("#list-chapter .pagination li a").each((_i, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/page[_-]?(\d+)/i) || href.match(/\?page=(\d+)/);
      if (match) {
        const p = parseInt(match[1], 10);
        if (p > totalChapterPages) totalChapterPages = p;
      }
    });

    $("#list-chapter .row a").each((_i, el) => {
      const chTitle = $(el).text().trim();
      const chHref = $(el).attr("href") || "";
      if (chTitle && chHref) chapters.push({ title: chTitle, url: resolveUrl(NOVELFULL_BASE, chHref) });
    });

    for (let p = 2; p <= totalChapterPages; p++) {
      const sep = novelUrl.includes("?") ? "&" : "?";
      try {
        const pageHtml = await fetchHtml(`${novelUrl}${sep}page=${p}`);
        const $p = cheerio.load(pageHtml);
        $p("#list-chapter .row a").each((_i, el) => {
          const chTitle = $p(el).text().trim();
          const chHref = $p(el).attr("href") || "";
          if (chTitle && chHref) chapters.push({ title: chTitle, url: resolveUrl(NOVELFULL_BASE, chHref) });
        });
      } catch { /* skip */ }
    }

    return {
      title, author, genres, status, rating, description,
      thumbnail: resolveUrl(NOVELFULL_BASE, thumbnail),
      totalChapters: chapters.length,
      chapters,
    };
  },

  async getChapterContent(chapterUrl, signal) {
    const html = await fetchHtml(chapterUrl, signal);
    const $ = cheerio.load(html);
    const contentEl = $("#chapter-content") || $(".chapter-c");
    contentEl.find("script, .ads, .adsbygoogle, ins, [id*='ads'], [class*='ads']").remove();
    return contentEl.html()?.trim() || "<p>Content unavailable</p>";
  },
};

// ── Source: NovelHall ─────────────────────────────────────

const NOVELHALL_BASE = "https://www.novelhall.com";

const novelhallSource: NovelSource = {
  id: "novelhall",
  name: "NovelHall",
  url: NOVELHALL_BASE,

  async search(keyword, page = 1) {
    const url = `${NOVELHALL_BASE}/index.php?s=so&module=book&keyword=${encodeURIComponent(keyword)}&page=${page}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const results: NovelSearchResult[] = [];
    $(".section3 table tbody tr").each((_i, el) => {
      // Columns: 1=genre (.type), 2=title, 3=latest chapter, 4=writer, 5=time
      const titleEl = $(el).find("td:nth-child(2) a").first();
      const title = titleEl.text().trim();
      const href = titleEl.attr("href") || "";
      const author = $(el).find("td a.writer").text().trim();

      if (title && href && !href.includes("/genre/")) {
        results.push({
          title,
          url: resolveUrl(NOVELHALL_BASE, href),
          slug: href.replace(/^\//, "").replace(/\/$/, ""),
          thumbnail: "",
          author,
        });
      }
    });

    let totalPages = 1;
    $(".page-nav a[data-ci-pagination-page]").each((_i, el) => {
      const p = parseInt($(el).attr("data-ci-pagination-page") || "0", 10);
      if (p > totalPages) totalPages = p;
    });

    return { results, page, totalPages };
  },

  async getInfo(novelUrl) {
    const html = await fetchHtml(novelUrl);
    const $ = cheerio.load(html);

    const title = $(".book-info h1").text().trim();
    const thumbnail = $(".book-img img").attr("src") || $(".img-thumbnail").attr("src") || "";

    // Author is in a span.blue containing "Author：" or "Author:"
    let author = "";
    $(".booktag span.blue, .total span.blue").each((_i, el) => {
      const text = $(el).text();
      if (text.includes("Author")) {
        author = text.replace(/Author[：:]\s*/, "").trim();
      }
    });

    const genres: string[] = [];
    $(".booktag a.red, .total a.red").each((_i, el) => { genres.push($(el).text().trim()); });

    let status = "";
    $(".booktag span.blue, .total span.blue").each((_i, el) => {
      const text = $(el).text();
      if (text.includes("Status")) {
        status = text.replace(/Status[：:]\s*/, "").trim();
      }
    });

    // Description: the full text is in .js-close-wrap, short in .js-open-wrap
    const description = $(".js-close-wrap").first().clone().children("span").remove().end().text().trim()
      || $(".js-open-wrap").first().text().trim()
      || $(".intro").text().trim();

    // Chapters from the full catalog (#morelist)
    const chapters: { title: string; url: string }[] = [];
    $("#morelist ul li a").each((_i, el) => {
      const chTitle = $(el).text().trim();
      const chHref = $(el).attr("href") || "";
      if (chTitle && chHref) {
        chapters.push({ title: chTitle, url: resolveUrl(NOVELHALL_BASE, chHref) });
      }
    });

    return {
      title, author, genres, status, rating: "N/A", description,
      thumbnail: thumbnail.startsWith("http") ? thumbnail : resolveUrl(NOVELHALL_BASE, thumbnail),
      totalChapters: chapters.length,
      chapters,
    };
  },

  async getChapterContent(chapterUrl, signal) {
    const html = await fetchHtml(chapterUrl, signal);
    const $ = cheerio.load(html);
    const contentEl = $("#htmlContent");
    contentEl.find("script, .ads, .adsbygoogle, ins, iframe, [id*='ads'], [class*='ads']").remove();
    return contentEl.html()?.trim() || "<p>Content unavailable</p>";
  },
};

// ── Source Registry ──────────────────────────────────────

const SOURCES: Record<string, NovelSource> = {
  novelfull: novelfullSource,
  novelhall: novelhallSource,
};

export function getAvailableSources(): { id: string; name: string; url: string }[] {
  return Object.values(SOURCES).map((s) => ({ id: s.id, name: s.name, url: s.url }));
}

function getSource(sourceId: string): NovelSource {
  const source = SOURCES[sourceId];
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  return source;
}

// ── Public API (delegates to source) ─────────────────────

export async function searchNovels(sourceId: string, keyword: string, page: number = 1) {
  return getSource(sourceId).search(keyword, page);
}

export async function getNovelInfo(sourceId: string, novelUrl: string) {
  return getSource(sourceId).getInfo(novelUrl);
}

// ── Download Manager ─────────────────────────────────────

class DownloadManager {
  private controllers = new Map<number, AbortController>();
  private processing = false;

  private broadcast(event: DownloadProgressEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("installer:download-progress", event);
      }
    }
  }

  async queueDownload(sourceId: string, novelInfo: NovelInfo): Promise<number> {
    const id = addDownload({
      sourceId,
      novelTitle: novelInfo.title,
      novelAuthor: novelInfo.author || null,
      novelUrl: novelInfo.chapters[0]?.url ?? "",
      thumbnail: novelInfo.thumbnail || null,
      chaptersJson: JSON.stringify(novelInfo.chapters),
      totalChapters: novelInfo.chapters.length,
    });

    this.broadcast({
      id, current: 0, total: novelInfo.chapters.length,
      chapterTitle: "", eta: null, status: "queued",
    });

    this.processQueue();
    return id;
  }

  cancelDownload(id: number): void {
    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
      this.controllers.delete(id);
    }
    updateDownloadStatus(id, "cancelled");
    this.broadcast({
      id, current: 0, total: 0, chapterTitle: "", eta: null, status: "cancelled",
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (true) {
        const rows = getDownloads();
        const next = rows.find((r) => r.status === "queued");
        if (!next) break;
        await this.processDownload(next);
      }
    } finally {
      this.processing = false;
    }
  }

  private async processDownload(row: InstallerDownloadRow): Promise<void> {
    const id = row.id;
    const source = getSource(row.source_id);
    const chapters: { title: string; url: string }[] = JSON.parse(row.chapters_json);
    const total = chapters.length;

    const controller = new AbortController();
    this.controllers.set(id, controller);
    const { signal } = controller;

    updateDownloadStatus(id, "downloading");
    this.broadcast({ id, current: 0, total, chapterTitle: "", eta: null, status: "downloading" });

    const chapterContents: { title: string; html: string }[] = [];
    const chapterTimes: number[] = [];

    try {
      for (let i = 0; i < total; i++) {
        if (signal.aborted) throw new Error("Download cancelled");

        const ch = chapters[i];
        const start = Date.now();

        // Calculate ETA from rolling average
        let eta: number | null = null;
        if (chapterTimes.length > 0) {
          const recentTimes = chapterTimes.slice(-10);
          const avgMs = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
          eta = Math.round(((total - i) * avgMs) / 1000);
        }

        this.broadcast({ id, current: i + 1, total, chapterTitle: ch.title, eta, status: "downloading" });
        updateDownloadProgress(id, i + 1);

        try {
          const html = await source.getChapterContent(ch.url, signal);
          chapterContents.push({ title: ch.title, html });
        } catch {
          if (signal.aborted) throw new Error("Download cancelled");
          chapterContents.push({ title: ch.title, html: "<p>Failed to load chapter</p>" });
        }

        chapterTimes.push(Date.now() - start);
        if (i < total - 1) await new Promise((r) => setTimeout(r, 200));
      }

      // Build EPUB
      const novelInfo: NovelInfo = {
        title: row.novel_title,
        author: row.novel_author || "Unknown",
        genres: [], status: "", rating: "", description: "",
        thumbnail: row.thumbnail || "",
        totalChapters: total,
        chapters,
      };

      // Fetch cover image
      let coverBuffer: Buffer | null = null;
      let coverMime = "image/jpeg";
      if (row.thumbnail) {
        try {
          const resp = await net.fetch(row.thumbnail, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          });
          if (resp.ok) {
            coverMime = resp.headers.get("content-type") || "image/jpeg";
            coverBuffer = Buffer.from(await resp.arrayBuffer());
          }
        } catch { /* skip cover */ }
      }

      const epubPath = buildEpub(novelInfo, chapterContents, coverBuffer, coverMime);
      updateDownloadStatus(id, "completed", { epubPath });
      this.controllers.delete(id);

      this.broadcast({ id, current: total, total, chapterTitle: "", eta: 0, status: "completed" });

      return;
    } catch (err) {
      this.controllers.delete(id);
      const msg = err instanceof Error ? err.message : "Download failed";
      if (msg.includes("cancelled")) {
        // Already set to cancelled in cancelDownload
        return;
      }
      updateDownloadStatus(id, "failed", { error: msg });
      this.broadcast({ id, current: 0, total, chapterTitle: "", eta: null, status: "failed" });
    }
  }

  /** Re-queue a failed download */
  retryDownload(id: number): void {
    updateDownloadStatus(id, "queued");
    // Reset progress
    updateDownloadProgress(id, 0);
    this.broadcast({ id, current: 0, total: 0, chapterTitle: "", eta: null, status: "queued" });
    this.processQueue();
  }

  /** Resume any interrupted downloads on startup */
  resumeOnStartup(): void {
    // Any downloads that were "downloading" when the app closed are now stale — re-queue them
    const rows = getDownloads();
    for (const row of rows) {
      if (row.status === "downloading") {
        updateDownloadStatus(row.id, "queued");
        updateDownloadProgress(row.id, 0);
      }
    }
    this.processQueue();
  }
}

let downloadManager: DownloadManager | null = null;

export function getDownloadManager(): DownloadManager {
  if (!downloadManager) {
    downloadManager = new DownloadManager();
  }
  return downloadManager;
}

// ── EPUB Builder (using adm-zip) ─────────────────────────

function buildEpub(info: NovelInfo, chapters: { title: string; html: string }[], coverImage?: Buffer | null, coverMime?: string): string {
  const zip = new AdmZip();

  zip.addFile("mimetype", Buffer.from("application/epub+zip"), "", 0);

  zip.addFile("META-INF/container.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`));

  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const tocEntries: string[] = [];

  // Cover image
  const hasCover = coverImage && coverImage.length > 0;
  const coverExt = coverMime?.includes("png") ? "png" : "jpg";
  const coverMediaType = coverMime?.includes("png") ? "image/png" : "image/jpeg";

  if (hasCover) {
    zip.addFile(`OEBPS/cover.${coverExt}`, coverImage);
    manifestItems.push(`    <item id="cover-image" href="cover.${coverExt}" media-type="${coverMediaType}" properties="cover-image"/>`);
    manifestItems.push(`    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
    spineItems.push(`    <itemref idref="cover"/>`);

    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title></head>
<body style="margin:0;padding:0;text-align:center">
<img src="cover.${coverExt}" alt="Cover" style="max-width:100%;max-height:100vh"/>
</body>
</html>`;
    zip.addFile("OEBPS/cover.xhtml", Buffer.from(coverXhtml));
  }

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

  const metaCover = hasCover ? `\n    <meta name="cover" content="cover-image"/>` : "";

  zip.addFile("OEBPS/content.opf", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(info.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(info.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">novel-${sanitizeFilename(info.title)}</dc:identifier>${metaCover}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineItems.join("\n")}
  </spine>
</package>`));

  zip.addFile("OEBPS/toc.ncx", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="novel-${sanitizeFilename(info.title)}"/>
  </head>
  <docTitle><text>${escapeXml(info.title)}</text></docTitle>
  <navMap>
${tocEntries.join("\n")}
  </navMap>
</ncx>`));

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
