/**
 * Test fixtures for WS-C tests (not used at runtime).
 */

import AdmZip from "adm-zip";

/** Minimal EPUB 2 with the given chapter bodies (xhtml body inner html). */
export function makeEpub(file: string, bodies: string[], titles?: string[]): string {
  const zip = new AdmZip();
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));
  zip.addFile("META-INF/container.xml", Buffer.from(
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  ));
  const items = bodies.map((_, i) => `<item id="ch${i}" href="text/ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join("");
  const spine = bodies.map((_, i) => `<itemref idref="ch${i}"/>`).join("");
  zip.addFile("OEBPS/content.opf", Buffer.from(
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata/>` +
    `<manifest>${items}</manifest><spine>${spine}</spine></package>`,
  ));
  bodies.forEach((b, i) => {
    const title = titles?.[i] ?? `Chapter ${i + 1}`;
    zip.addFile(`OEBPS/text/ch${i}.xhtml`, Buffer.from(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${b}</body></html>`,
    ));
  });
  zip.writeZip(file);
  return file;
}
