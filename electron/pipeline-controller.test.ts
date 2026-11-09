/**
 * WS-C: the controller behind `useChapterPipeline` (the React hook is a thin
 * useSyncExternalStore wrapper around it). Loads, rebuilds on events, drops stale results.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createChapterPipeline, type ChapterPipelineSources } from "./shared/pipeline/controller";
import { toBookContentV2 } from "./shared/pipeline/source";
import { makeLexicon, EMPTY_LEXICON } from "./shared/pipeline/lexicon";
import type { AIEvent, ChapterArtifacts } from "./shared/ai/types";
import type { BookContentV2, EntityMatcher, Lexicon } from "./shared/pipeline/types";

function book(filePath: string, chapters: string[][]): BookContentV2 {
  return toBookContentV2(filePath, {
    isImageBook: false,
    toc: [],
    chapters: chapters.map((ps, i) => ({ title: `Ch ${i}`, paragraphs: ps, htmlParagraphs: ps.map((p) => `<p>${p}</p>`), sourceKey: `ch${i}.xhtml` })),
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(over: Partial<ChapterPipelineSources> = {}) {
  const books: Record<string, BookContentV2> = {
    "/a.epub": book("/a.epub", [["Kim met the god."], ["Second chapter.", "More text."]]),
  };
  let lexicon: Lexicon = EMPTY_LEXICON;
  const artifacts = new Map<string, ChapterArtifacts>();
  let entities: EntityMatcher[] = [];
  const listeners = new Set<(e: AIEvent) => void>();
  const calls = { book: 0, artifacts: 0, entities: 0, lexicon: 0 };
  const sources: ChapterPipelineSources = {
    getBook: async (fp) => { calls.book++; const b = books[fp]; if (!b) throw new Error(`no such book ${fp}`); return b; },
    getLexicon: async () => { calls.lexicon++; return lexicon; },
    getArtifacts: async (fp, i) => { calls.artifacts++; return artifacts.get(`${fp}#${i}`) ?? null; },
    getEntities: async () => { calls.entities++; return entities; },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    ...over,
  };
  return {
    sources, books, artifacts, calls, listeners,
    setLexicon: (l: Lexicon) => { lexicon = l; },
    setEntities: (e: EntityMatcher[]) => { entities = e; },
    emit: (e: AIEvent) => { for (const l of listeners) l(e); },
  };
}

test("loads book, lexicon and artifacts, then renders the chapter", async () => {
  const env = setup();
  const pl = createChapterPipeline(env.sources);
  const seen: string[] = [];
  pl.subscribe(() => seen.push(pl.getState().status));
  assert.equal(pl.getState().status, "idle");
  pl.setTarget("/a.epub", 1);
  assert.equal(pl.getState().status, "loading");
  await pl.idle();
  const s = pl.getState();
  assert.equal(s.status, "ready");
  assert.equal(s.source?.index, 1);
  assert.deepEqual(s.chapter?.paras.map((p) => p.text), ["Second chapter.", "More text."]);
  assert.equal(s.original, null);
  assert.deepEqual(s.layers, { rewrite: "none", format: "none" });
  assert.ok(seen.includes("ready"));
  pl.dispose();
  assert.equal(env.listeners.size, 0, "unsubscribes from ai:event on dispose");
});

test("applies fresh layers unless hidden; reports stale layers", async () => {
  const env = setup();
  const b = env.books["/a.epub"];
  const ch = b.chapters[1];
  const [p0, p1] = ch.paras.map((p) => p.id);
  env.artifacts.set("/a.epub#1", {
    chapterId: ch.id,
    rewrite: { mode: "concise", artifactHash: "r1", sourceHash: ch.sourceHash, paras: { [p0]: { html: "<p>Second.</p>" }, [p1]: { dropped: true } } },
    format: { artifactHash: "f1", base: "source", baseHash: ch.sourceHash, paras: {} },
  });
  const pl = createChapterPipeline(env.sources, { withOriginal: true });
  pl.setTarget("/a.epub", 1);
  await pl.idle();
  let s = pl.getState();
  assert.deepEqual(s.chapter?.visible, [0]);
  assert.equal(s.chapter?.paras[0].text, "Second.");
  assert.deepEqual(s.original?.visible, [0, 1], "original has no layers");
  assert.deepEqual(s.layers, { rewrite: "applied", format: "stale" }, "source-based format can't sit on a rewrite");

  pl.setOptions({ showRewrite: false });
  s = pl.getState();
  assert.deepEqual(s.chapter?.visible, [0, 1]);
  assert.deepEqual(s.layers, { rewrite: "hidden", format: "applied" });
  pl.dispose();
});

test("ai:events: artifact (this chapter only), lexicon, knowledge/frontier (this book only)", async () => {
  const env = setup();
  const pl = createChapterPipeline(env.sources);
  pl.setTarget("/a.epub", 0);
  await pl.idle();
  assert.equal(pl.getState().chapter?.paras[0].html, "<p>Kim met the god.</p>");

  const before = { ...env.calls };
  env.emit({ type: "artifact", filePath: "/a.epub", chapterIndex: 1, chapterId: "x", kind: "rewrite", variant: "" });
  env.emit({ type: "knowledge", filePath: "/other.epub", chapters: [0], reason: "ingest" });
  await pl.idle();
  assert.equal(env.calls.artifacts, before.artifacts);
  assert.equal(env.calls.entities, before.entities);

  env.setEntities([{ id: "kim", names: ["Kim"], color: "blue", type: "character" }]);
  env.emit({ type: "knowledge", filePath: "/a.epub", chapters: [0], reason: "ingest" });
  await pl.idle();
  assert.match(pl.getState().chapter!.paras[0].html, /data-wiki-id="kim"/);

  const lex = makeLexicon([{ from: "god", to: "Ascendant" }]);
  env.setLexicon(lex);
  const key = pl.getState().chapter!.variantKey;
  env.emit({ type: "lexicon", version: lex.version });
  await pl.idle();
  assert.equal(pl.getState().chapter!.paras[0].text, "Kim met the ascendant.");
  assert.notEqual(pl.getState().chapter!.variantKey, key);

  const ch = env.books["/a.epub"].chapters[0];
  env.artifacts.set("/a.epub#0", {
    chapterId: ch.id,
    rewrite: { mode: "polish", artifactHash: "r", sourceHash: ch.sourceHash, paras: { [ch.paras[0].id]: { html: "<p>Kim met a god.</p>" } } },
  });
  env.emit({ type: "artifact", filePath: "/a.epub", chapterIndex: 0, chapterId: ch.id, kind: "rewrite", variant: "" });
  await pl.idle();
  assert.equal(pl.getState().chapter!.paras[0].text, "Kim met a ascendant.");
  pl.dispose();
});

test("stale responses are discarded when the reader moves on", async () => {
  const slow = deferred<ChapterArtifacts | null>();
  const env = setup();
  let first = true;
  const pl = createChapterPipeline({
    ...env.sources,
    getArtifacts: (fp, i) => {
      if (first) { first = false; return slow.promise; }
      return env.sources.getArtifacts!(fp, i);
    },
  });
  pl.setTarget("/a.epub", 0);
  pl.setTarget("/a.epub", 1);
  // (idle() would wait for the never-resolved first request; just let the fast ones settle)
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(pl.getState().source?.index, 1);
  assert.equal(pl.getState().status, "ready");
  const ch0 = env.books["/a.epub"].chapters[0];
  slow.resolve({ chapterId: ch0.id, rewrite: { mode: "polish", artifactHash: "x", sourceHash: ch0.sourceHash, paras: {} } });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pl.getState().artifacts, null, "chapter 0's late artifacts are ignored");
  pl.dispose();
});

test("errors: missing book → error state; failing artifacts/entities degrade to no layers", async () => {
  const errors: string[] = [];
  const env = setup({
    getArtifacts: async () => { throw new Error("No handler registered for 'chapters:artifacts'"); },
    getEntities: async () => { throw new Error("knowledge off"); },
    onError: (what) => errors.push(what),
  });
  const pl = createChapterPipeline(env.sources);
  pl.setTarget("/a.epub", 0);
  await pl.idle();
  assert.equal(pl.getState().status, "ready");
  assert.equal(pl.getState().chapter?.paras.length, 1);
  assert.deepEqual(errors.sort(), ["artifacts", "entities"]);

  pl.setTarget("/missing.epub", 0);
  await pl.idle();
  assert.equal(pl.getState().status, "error");
  assert.match(pl.getState().error ?? "", /no such book/);

  pl.setTarget("/a.epub", 99);
  await pl.idle();
  assert.equal(pl.getState().status, "error");
  assert.match(pl.getState().error ?? "", /out of range/);
  pl.dispose();
});

test("rebuild is memoised: unrelated option churn keeps the same RenderedChapter object", async () => {
  const env = setup();
  const pl = createChapterPipeline(env.sources);
  pl.setTarget("/a.epub", 0);
  await pl.idle();
  const a = pl.getState().chapter;
  pl.setOptions({ showRewrite: true }); // no change
  pl.refresh("artifacts");
  await pl.idle();
  assert.equal(pl.getState().chapter, a);
  const annotations = [{ kind: "highlight" as const, paraId: a!.paras[0].id, quote: "met", id: "h", tone: "quote" as const }];
  pl.setOptions({ annotations });
  assert.notEqual(pl.getState().chapter, a);
  assert.match(pl.getState().chapter!.paras[0].html, /codex-hl/);
  pl.dispose();
});

test("detach/attach (React StrictMode remount): stops listening, then resubscribes and refreshes", async () => {
  const env = setup();
  const pl = createChapterPipeline(env.sources);
  pl.setTarget("/a.epub", 0);
  await pl.idle();
  pl.detach();
  assert.equal(env.listeners.size, 0);
  const lex = makeLexicon([{ from: "god", to: "Ascendant" }]);
  env.setLexicon(lex);
  env.emit({ type: "lexicon", version: lex.version }); // missed while detached
  await pl.idle();
  assert.equal(pl.getState().lexicon.version, EMPTY_LEXICON.version);
  pl.attach();
  pl.attach(); // idempotent
  assert.equal(env.listeners.size, 1);
  await pl.idle();
  assert.equal(pl.getState().lexicon.version, lex.version, "refreshed on re-attach");
  pl.dispose();
});
