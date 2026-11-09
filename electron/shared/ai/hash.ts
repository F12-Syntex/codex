/**
 * Stable, dependency-free hashing for cache keys, artifact hashes and ids (owner: WS-A).
 *
 * PURE: no `electron`, Node or DOM imports (usable from main, renderer and tests).
 *
 * - `fnv1a64(str)`: 64-bit FNV-1a over the UTF-8 bytes of `str`, as 16 lowercase hex chars.
 *   Matches the reference vectors (`""` → cbf29ce484222325, `"a"` → af63dc4c8601ec8c).
 *   Implemented with four 16-bit limbs (no BigInt in the hot loop), so hashing a 160k-char
 *   chapter costs about a millisecond.
 * - `stableStringify(v)`: JSON with object keys sorted recursively, so logically equal inputs
 *   hash the same regardless of key order. `undefined` properties are dropped (as JSON does).
 * - `hashOf(...parts)`: fnv1a64 over the parts joined with NUL (strings as-is, others stable-stringified).
 */

/** 64-bit FNV-1a of the UTF-8 encoding of `str`, as 16 lowercase hex chars. */
export function fnv1a64(str: string): string {
  const [h0, h1, h2, h3] = fnv1a64Limbs(str);
  return hex16(h3) + hex16(h2) + hex16(h1) + hex16(h0);
}

/** Same hash in base36 (shorter ids, e.g. ParaIds/ChapterIds). Not zero-padded. */
export function fnv1a64Base36(str: string): string {
  const [h0, h1, h2, h3] = fnv1a64Limbs(str);
  // Split into a 32-bit high and 32-bit low half and combine via BigInt once.
  const hi = (h3 * 65536 + h2) >>> 0;
  const lo = (h1 * 65536 + h0) >>> 0;
  return ((BigInt(hi) << BigInt(32)) | BigInt(lo)).toString(36);
}

function hex16(n: number): string {
  return (n | 0x10000).toString(16).slice(1);
}

function fnv1a64Limbs(str: string): [number, number, number, number] {
  // offset basis 0xcbf29ce484222325, little-endian 16-bit limbs
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;

  const step = (byte: number) => {
    h0 ^= byte;
    // multiply by the FNV prime 0x100000001b3 = 2^40 + 0x1b3 (mod 2^64)
    const t0 = h0 * 0x1b3;
    let t1 = h1 * 0x1b3;
    let t2 = h2 * 0x1b3;
    let t3 = h3 * 0x1b3;
    t2 += h0 << 8; // 2^40 = limb 2 shifted by 8 bits
    t3 += h1 << 8;
    t1 += t0 >>> 16;
    h0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    h1 = t1 & 0xffff;
    t3 += t2 >>> 16;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  };

  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      step(c);
    } else if (c < 0x800) {
      step(0xc0 | (c >> 6));
      step(0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        i++;
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        step(0xf0 | (c >> 18));
        step(0x80 | ((c >> 12) & 0x3f));
        step(0x80 | ((c >> 6) & 0x3f));
        step(0x80 | (c & 0x3f));
      } else {
        // lone high surrogate → U+FFFD, like TextEncoder
        step(0xef); step(0xbf); step(0xbd);
      }
    } else if (c >= 0xd800 && c <= 0xdfff) {
      step(0xef); step(0xbf); step(0xbd);
    } else {
      step(0xe0 | (c >> 12));
      step(0x80 | ((c >> 6) & 0x3f));
      step(0x80 | (c & 0x3f));
    }
  }
  return [h0, h1, h2, h3];
}

/** JSON.stringify with recursively sorted object keys. Throws on cycles (like JSON.stringify). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value, new Set()));
}

function sortKeys(v: unknown, seen: Set<object>): unknown {
  if (v === null || typeof v !== "object") return v;
  if (seen.has(v as object)) throw new TypeError("stableStringify: cyclic structure");
  seen.add(v as object);
  try {
    if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : sortKeys(x, seen)));
    if (typeof (v as { toJSON?: unknown }).toJSON === "function") return sortKeys((v as { toJSON(): unknown }).toJSON(), seen);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined && typeof x !== "function") out[k] = sortKeys(x, seen);
    }
    return out;
  } finally {
    seen.delete(v as object);
  }
}

/** fnv1a64 over several parts (strings verbatim, anything else via `stableStringify`), NUL-joined. */
export function hashOf(...parts: unknown[]): string {
  return fnv1a64(parts.map((p) => (typeof p === "string" ? p : stableStringify(p))).join("\u0000"));
}
