/**
 * Text pipeline public surface (owner: WS-C). Import from `@shared/pipeline` (renderer) or
 * `electron/shared/pipeline` (main). PURE: no `electron`, Node or DOM imports.
 */

export * from "./types";
export { buildChapter, variantKeyOf, resolveAnchor, visibleText } from "./build";
export { sanitizeHtml, plainTextToHtml } from "./sanitize";
export {
  applyLexicon, applyLexiconText, compileLexicon, makeLexicon, normalizeLexiconEntries, lexiconVersion,
  EMPTY_LEXICON, entriesFromLegacy, entriesToLegacy, smartCase,
} from "./lexicon";
export { LEXICON_PRESETS, CULTIVATION_TERMS, getLexiconPreset, mergePreset, type LexiconPreset } from "./lexicon-presets";
export { tokenizeVisible, alignBoundaries, buildSpeech, wordRangesInNodes } from "./speech";
export { compileEntities, matchEntities, locateQuote } from "./annotate";
export { applyLayers, isRewriteFresh, isFormatFresh } from "./layers";
export { PARSER_VERSION, assignParaIds, chapterIdOf, bookIdOf, normalizeForId, paraIdBase, parseParaId } from "./ids";
export { toBookContentV2, buildSourceChapter, htmlToText, classifyPara, findChapterById, toSourceChapter } from "./source";
export { createChapterPipeline, type ChapterPipeline, type ChapterPipelineSources, type ChapterPipelineState } from "./controller";
