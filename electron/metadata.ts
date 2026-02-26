import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

export interface ExtractedMetadata {
  title: string;
  author: string;
  cover: string; // data:image/...;base64,... or ""
}

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

// ── EPUB ───────────────────────────────────────────

function extractEpubMetadata(filePath: string): ExtractedMetadata {
  const fallback: ExtractedMetadata = {
    title: path.basename(filePath, path.extname(filePath)),
    author: "Unknown",
    cover: "",
  };

  try {
    const zip = new AdmZip(filePath);

    // 1. Find the OPF file via container.xml
    const containerEntry = zip.getEntry("META-INF/container.xml");
    if (!containerEntry) return fallback;

    const containerXml = containerEntry.getData().toString("utf-8");
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!rootfileMatch) return fallback;

    const opfPath = rootfileMatch[1];
    const opfDir = path.posix.dirname(opfPath);

    // 2. Parse OPF for metadata
    const opfEntry = zip.getEntry(opfPath);
    if (!opfEntry) return fallback;

    const opfXml = opfEntry.getData().toString("utf-8");

    // Extract title
    const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const title = titleMatch?.[1]?.trim() || fallback.title;

    // Extract author
    const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
    const author = authorMatch?.[1]?.trim() || "Unknown";

    // 3. Find cover image
    let cover = "";

    // Method A: <meta name="cover" content="cover-image-id" />
    const coverMetaMatch = opfXml.match(/<meta[^>]+name="cover"[^>]+content="([^"]+)"/i)
      || opfXml.match(/<meta[^>]+content="([^"]+)"[^>]+name="cover"/i);

    if (coverMetaMatch) {
      const coverId = coverMetaMatch[1];
      // Find the manifest item with this id
      const itemRegex = new RegExp(
        `<item[^>]+id="${coverId}"[^>]+href="([^"]+)"`,
        "i"
      );
      const itemMatch = opfXml.match(itemRegex);
      if (itemMatch) {
        const coverHref = itemMatch[1];
        const coverPath = opfDir === "." ? coverHref : `${opfDir}/${coverHref}`;
        const coverEntry = zip.getEntry(coverPath) || zip.getEntry(decodeURIComponent(coverPath));
        if (coverEntry) {
          cover = bufferToDataUri(coverEntry.getData(), coverHref);
        }
      }
    }

    // Method B: Look for item with properties="cover-image"
    if (!cover) {
      const coverPropMatch = opfXml.match(
        /<item[^>]+properties="[^"]*cover-image[^"]*"[^>]+href="([^"]+)"/i
      ) || opfXml.match(
        /<item[^>]+href="([^"]+)"[^>]+properties="[^"]*cover-image[^"]*"/i
      );
      if (coverPropMatch) {
        const coverHref = coverPropMatch[1];
        const coverPath = opfDir === "." ? coverHref : `${opfDir}/${coverHref}`;
        const coverEntry = zip.getEntry(coverPath) || zip.getEntry(decodeURIComponent(coverPath));
        if (coverEntry) {
          cover = bufferToDataUri(coverEntry.getData(), coverHref);
        }
      }
    }

    // Method C: Look for any image with "cover" in the filename
    if (!cover) {
      const entries = zip.getEntries();
      for (const entry of entries) {
        const name = entry.entryName.toLowerCase();
        if (name.includes("cover") && isImageFile(name)) {
          cover = bufferToDataUri(entry.getData(), entry.entryName);
          break;
        }
      }
    }

    return { title, author, cover };
  } catch {
    return fallback;
  }
}

// ── CBZ ────────────────────────────────────────────

function extractCbzMetadata(filePath: string): ExtractedMetadata {
  const fallback: ExtractedMetadata = {
    title: path.basename(filePath, path.extname(filePath)),
    author: "Unknown",
    cover: "",
  };

  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries()
      .filter((e) => !e.isDirectory && isImageFile(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    if (entries.length === 0) return fallback;

    // First image (alphabetically) is the cover
    const firstImage = entries[0];
    const cover = bufferToDataUri(firstImage.getData(), firstImage.entryName);

    return { ...fallback, cover };
  } catch {
    return fallback;
  }
}

// ── PDF ────────────────────────────────────────────

function extractPdfMetadata(filePath: string): ExtractedMetadata {
  const fallback: ExtractedMetadata = {
    title: path.basename(filePath, path.extname(filePath)),
    author: "Unknown",
    cover: "",
  };

  try {
    // Read first 8KB to find metadata in header
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8192);
    fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    const header = buf.toString("latin1");

    // Try to extract /Title and /Author from PDF info dictionary
    const titleMatch = header.match(/\/Title\s*\(([^)]+)\)/);
    const authorMatch = header.match(/\/Author\s*\(([^)]+)\)/);

    const title = titleMatch?.[1]?.trim() || fallback.title;
    const author = authorMatch?.[1]?.trim() || "Unknown";

    return { title, author, cover: "" };
  } catch {
    return fallback;
  }
}

// ── Public API ─────────────────────────────────────

export function extractMetadata(filePath: string): ExtractedMetadata {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".epub":
      return extractEpubMetadata(filePath);
    case ".cbz":
      return extractCbzMetadata(filePath);
    case ".pdf":
      return extractPdfMetadata(filePath);
    default:
      // CBR, MOBI — fallback to filename
      return {
        title: path.basename(filePath, ext),
        author: "Unknown",
        cover: "",
      };
  }
}
