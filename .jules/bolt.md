## 2025-02-17 - [Initial Learning]
**Learning:** Understanding React performance patterns in this Electron app
**Action:** Found multiple areas where \`useMemo\` and \`useCallback\` are heavily used.

## 2025-02-17 - [Initial Learning]
**Learning:** BookCard runs an expensive color extraction logic repeatedly on image load (`extractDominantColor`). This iterates over image pixels every time a cover is loaded.
**Action:** Since BookCard is memoized, we should make sure that this extraction function doesn't cause unnecessary bottlenecks, or we can look for other bottlenecks.

## 2025-02-17 - [Pre-computing strings for filters]
**Learning:** In components with frequent key-press events like `search-overlay.tsx`, mapping through an array of objects to run `.toLowerCase()` dynamically for case-insensitive filtering adds massive GC pressure and CPU cycles during render loops.
**Action:** Always pre-compute a `searchKey` string with lowercased values once (e.g., during the initial initialization logic or memoized dataset generation) instead of calling string allocation functions dynamically inside filtering loops that trigger often.

**Learning:** `extractDominantColor` in `src/components/content/book-card.tsx` processes canvas pixels in JS which blocks the main thread for every image load. Removing it or substituting with a highly optimized one, or simply caching. Wait, the problem is simpler: `extractDominantColor` is called inside `handleImageLoad`. Can we memoize or speed it up?
Actually, `size = 32` is 32x32 pixels = 1024 pixels, loop iterates 800 times. That is tiny and fast. It might not be the bottleneck.

Let's look at `SearchOverlay` - it does full data flatten on every render/keystroke?

Let's look at `src/components/search-overlay.tsx`.
`allItems` is memoized.

```tsx
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allItems.filter(
      (r) =>
        r.item.title.toLowerCase().includes(q) ||
        r.item.author.toLowerCase().includes(q)
    );
  }, [query]);
```

Wait, `filtered` is missing `allItems` in the dependency array. ESLint flagged this.
If `allItems` changes, `filtered` is not recomputed.

What about `src/app/page.tsx`?

```tsx
  const processedItems = useMemo(() => {
    let items = [...rawItems];
    if (formatFilter !== "all") {
      items = items.filter((item) => item.format === formatFilter);
    }
    items.sort((a, b) => {
      const aVal = a[sortField].toLowerCase();
      const bVal = b[sortField].toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [rawItems, formatFilter, sortField, sortDir]);
```

This sorts items on every render when dependencies change. That's fine.

Let's look at `handleToggleSelect`:
```tsx
    if (shiftKey && lastSelectedIdRef.current !== null) {
      const lastIdx = processedItems.findIndex((i) => i.id === lastSelectedIdRef.current);
      const currIdx = processedItems.findIndex((i) => i.id === id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) next.add(processedItems[i].id);
          return next;
        });
        return;
      }
    }
```
This is fine.


Wait, `handleMeasure` is defined in `src/app/page.tsx`? No, it's defined in `src/app/reader/components/Reader.tsx`:

```tsx
  const handleMeasure = useCallback((measured: number) => {
    setTotalPages(measured);
    if (pendingLastPageRef.current && measured > 1) {
      pendingLastPageRef.current = false;
      setCurrentPage(measured - 1);
    } else {
      // Clamp current page to valid range
      setCurrentPage((prev) => Math.min(prev, measured - 1));
    }
  }, []);
```
This is passed down to `TextContent` which calls it.

```tsx
  const measure = useCallback(() => {
    ...
    requestAnimationFrame(() => {
      ...
      onMeasure(pages);
      ...
    });
  }, [padding, maxTextWidth, columnGap, onMeasure]);

  useEffect(() => {
    measure();
  }, [measure, htmlParagraphs, fontFamily, fontSize, lineHeight, paraSpacing]);
```

`onMeasure` triggers `handleMeasure` which calls `setTotalPages(measured)` and `setCurrentPage`.
These state changes in `Reader` cause a re-render of `TextContent`.
Is this causing cascading renders?

But let's look back at `Reader.tsx` -> `TextContent`.
What if we optimize the `filterTitleParagraph`?
It is run inside `useMemo`, which takes `htmlParagraphs` and `chapterTitle`.
Then `filteredHtml` maps over it and injects wiki entities using regex.

Actually, let's look at `SearchOverlay`:
```tsx
  const allItems = useMemo(() => getAllItems(bookData, comicData), [bookData, comicData]);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allItems.filter(
      (r) =>
        r.item.title.toLowerCase().includes(q) ||
        r.item.author.toLowerCase().includes(q)
    );
  }, [query]);
```
As ESLint reported, `filtered` is missing `allItems` in the dependency array! If `bookData` changes, `allItems` changes, but `filtered` won't update until `query` changes! This is a bug but not necessarily the best performance optimization.

What about `src/app/wiki/components/RelationshipGraph.tsx`?
```tsx
  // Fetch all relationships
  useEffect(() => {
    window.electronAPI?.wikiGetAllRelationships(filePath).then((rows: RelRow[]) => {
      if (rows) setRels(rows);
    });
  }, [filePath]);
```

Let's look at `book-card.tsx` again.
Using `<img>` with `onLoad` triggering `extractDominantColor`.

Wait, the prompt says: "Pick the BEST opportunity that: Has measurable performance impact... Can be implemented cleanly in < 50 lines".

Let's look for a missing memoization or a re-render bottleneck.
In `src/app/page.tsx`:
```tsx
  const processedItems = useMemo(() => {
    let items = [...rawItems];
    if (formatFilter !== "all") {
      items = items.filter((item) => item.format === formatFilter);
    }
    items.sort((a, b) => {
      const aVal = a[sortField].toLowerCase();
      const bVal = b[sortField].toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [rawItems, formatFilter, sortField, sortDir]);
```
Wait, sorting is `O(n log n)`, but we are calling `.toLowerCase()` on `a[sortField]` and `b[sortField]` inside the sort comparator!
For an array of 1000 items, `sort` will call the comparator ~10,000 times, which means `.toLowerCase()` is called 20,000 times!
We could memoize or pre-calculate `.toLowerCase()`, or use `localeCompare`.
```tsx
    items.sort((a, b) => {
      return sortDir === "asc"
        ? a[sortField].localeCompare(b[sortField], undefined, { sensitivity: 'base' })
        : b[sortField].localeCompare(a[sortField], undefined, { sensitivity: 'base' });
    });
```
Is this a big enough bottleneck?

What else?
In `src/components/search-overlay.tsx`:
```tsx
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allItems.filter(
      (r) =>
        r.item.title.toLowerCase().includes(q) ||
        r.item.author.toLowerCase().includes(q)
    );
  }, [query]);
```
If `allItems` has thousands of items, filtering calls `.toLowerCase()` on title and author for every item on every keystroke.
Pre-calculating lowercase fields in `getAllItems` would speed this up. Or adding `allItems` to the deps.

Let's check `TextContent.tsx`:
```tsx
  const filteredHtml = useMemo(() => {
    if (!wikiEnabled || !entityRegex || wikiEntityIndex.length === 0) return filteredHtmlRaw;
    return filteredHtmlRaw.map((html) => injectWikiEntities(html, wikiEntityIndex, entityRegex));
  }, [filteredHtmlRaw, wikiEnabled, entityRegex, wikiEntityIndex]);
```
`injectWikiEntities` runs for every paragraph on every render? No, it's memoized by `filteredHtmlRaw`, `wikiEnabled`, `entityRegex`, `wikiEntityIndex`.

What about `src/app/reader/components/TextContent.tsx` missing memoization?
```tsx
  const paragraphsJSX = filteredHtml.map((html, i) => {
    ...
```
`paragraphsJSX` is NOT memoized! It maps over `filteredHtml` every single render! If a book chapter has 500 paragraphs, `paragraphsJSX` maps over 500 strings, creates 500 React elements, executes DOM replacements (`buildFirstParagraph`), and loops over comments for every single paragraph (`commentsByPara.get`) on EVERY render. `TextContent` receives `ttsStatus`, `ttsParagraphIndex`, `ttsActiveWordIndex` which change VERY frequently (every 100-200ms) as Edge TTS reads words and paragraphs.
This means `paragraphsJSX` creates hundreds of DOM nodes and does regex repeatedly while the user listens to TTS or moves the mouse (if there are hover states or anything).
Wait, no: `ttsActiveWordIndex` changes every ~200ms. And `TextContent` re-renders.
Re-rendering 500 paragraphs every 200ms will absolutely tank the framerate and cause the UI to stutter during TTS playback.
Wait! `ttsActiveWordIndex` isn't used inside `paragraphsJSX`! It's used in a separate `useEffect`!
Let's check if `ttsActiveWordIndex` causes `paragraphsJSX` to rebuild.
Yes, because `TextContent` re-renders when its props change. `ttsActiveWordIndex` is passed as a prop!

```tsx
export function TextContent({
  chapterTitle,
  htmlParagraphs,
  // ...
  ttsActiveWordIndex = -1,
  ttsParagraphIndex = -1,
```
Every time `ttsActiveWordIndex` changes, `TextContent` re-renders, rebuilding `paragraphsJSX`.

If we memoize `paragraphsJSX` with `useMemo`, we can skip rebuilding it unless its actual dependencies change (`filteredHtml`, `commentsEnabled`, `commentsByPara`, `fontSize`, `theme`, etc).

Let's trace the dependencies of `paragraphsJSX`:
```tsx
  const paragraphsJSX = useMemo(() => filteredHtml.map((html, i) => {
    ...
    // dependencies:
    // filteredHtml
    // paraSpacing
    // firstTextIndex
    // fontSize
    // filterOffset
    // ttsShowReadMark
    // ttsHighWaterMark
    // ttsParagraphIndex  <-- Oh! Wait. It uses ttsParagraphIndex.
    // commentsEnabled
    // commentsByPara
    // expandedCommentPara
    // addingCommentPara
    // commentInput
```
If `ttsParagraphIndex` is a dependency, `paragraphsJSX` will still rebuild every time the paragraph changes, but not every time the *word* changes. That's a huge improvement (from 5 times a second to once every 10 seconds).

Let's look at `TextContent.tsx`:
```tsx
    const isRead = ttsShowReadMark && ttsHighWaterMark >= 0 && (
      ttsParagraphIndex >= 0
        ? (originalIdx < ttsParagraphIndex && originalIdx <= ttsHighWaterMark)
        : originalIdx <= ttsHighWaterMark
    );
```
Yes, `isRead` uses `ttsParagraphIndex` and `ttsHighWaterMark`. So it changes once per paragraph.
But wait! What about `expandedCommentPara`, `addingCommentPara`, `commentInput`?
```tsx
            onClick={(e) => {
              e.stopPropagation();
              setExpandedCommentPara(expandedCommentPara === originalIdx ? null : originalIdx);
              setAddingCommentPara(null);
              setCommentInput("");
            }}
```
It uses state setter callbacks!
Wait, `setExpandedCommentPara` doesn't need to read the current state if we use a functional update:
```tsx
setExpandedCommentPara(prev => prev === originalIdx ? null : originalIdx);
```
But `commentInput` is used inside `paragraphsJSX`?
No! `paragraphsJSX` does not use `commentInput` directly. It just calls `setCommentInput("")`.
Wait, let's verify.

Ah!
`paragraphsJSX` is rebuilt every time `ttsParagraphIndex` changes.
Wait, if it's NOT memoized, it's rebuilt on EVERY render, which means if `TextContent` receives a new prop (like `ttsActiveWordIndex` changing every 200ms), it rebuilds 500 paragraphs 5 times a second!

If we wrap `paragraphsJSX` in a `useMemo`, we can specify dependencies:
```tsx
  const paragraphsJSX = useMemo(() => {
    return filteredHtml.map((html, i) => {
       ...
    });
  }, [
    filteredHtml,
    firstTextIndex,
    filterOffset,
    fontSize,
    paraSpacing,
    ttsShowReadMark,
    ttsHighWaterMark,
    ttsParagraphIndex,
    commentsEnabled,
    commentsByPara,
    expandedCommentPara,
    addingCommentPara
  ]);
```
Wait, does it use `addingCommentPara` and `expandedCommentPara`? Yes, inside the `onClick` handler of the comment buttons!
Wait, but if we use a functional state update for those, we could remove them from the dependency array, avoiding re-rendering the whole chapter when a user clicks a comment button. BUT `paragraphsJSX` also needs to know if `expandedCommentPara === originalIdx` to render correctly? Actually, NO! The comment popover is rendered OUTSIDE of `paragraphsJSX`!
```tsx
      {/* Comment popover — rendered outside the paginated slider, fixed to viewport */}
      {commentsEnabled && expandedCommentPara !== null && commentsByPara.get(expandedCommentPara) && (() => {
```
The only place it uses `expandedCommentPara` inside `paragraphsJSX` is:
```tsx
            onClick={(e) => {
              e.stopPropagation();
              setExpandedCommentPara(prev => prev === originalIdx ? null : originalIdx);
              setAddingCommentPara(null);
              setCommentInput("");
            }}
```
Wait, the original code is:
```tsx
setExpandedCommentPara(expandedCommentPara === originalIdx ? null : originalIdx);
```
If we change it to a functional update:
```tsx
setExpandedCommentPara(prev => prev === originalIdx ? null : originalIdx);
setAddingCommentPara(prev => prev === originalIdx ? null : originalIdx);
```
Then we do NOT need `expandedCommentPara` or `addingCommentPara` in the dependency array!
So we ONLY need:
```tsx
  [
    filteredHtml,
    firstTextIndex,
    filterOffset,
    fontSize,
    paraSpacing,
    ttsShowReadMark,
    ttsHighWaterMark,
    ttsParagraphIndex,
    commentsEnabled,
    commentsByPara
  ]
```
This means when `ttsActiveWordIndex` changes (5 times a second), `paragraphsJSX` is NOT rebuilt! It just uses the memoized array of React elements.
The TTS highlight overlays (`wordRects` and `bothWordRects`) are rendered as absolutely positioned DOM nodes outside of `paragraphsJSX`, so they just get updated via React state, but the massive 500-paragraph DOM tree is memoized and doesn't get rebuilt!
This is a MASSIVE performance win.

Let's check if there are other dependencies used inside `paragraphsJSX`.
`html`, `i`, `isEmpty`, `isImage`, `isFirst`, `renderedHtml`, `originalIdx`, `paraComments`, `hasComments`.
Variables from outer scope:
- `filteredHtml`
- `paraSpacing`
- `firstTextIndex`
- `fontSize`
- `filterOffset`
- `ttsShowReadMark`
- `ttsHighWaterMark`
- `ttsParagraphIndex`
- `commentsEnabled`
- `commentsByPara`
- `setExpandedCommentPara` (stable)
- `setAddingCommentPara` (stable)
- `setCommentInput` (stable)

Wait, `buildFirstParagraph` is defined inside `TextContent`:
```tsx
  const buildFirstParagraph = useCallback((html: string) => {
    ...
  }, [fontSize]);
```
Currently it's:
```tsx
  const buildFirstParagraph = (html: string) => {
    ...
  };
```
We need to either move it into the `useMemo` or wrap it in `useCallback`.

Wait, the prompt says "Implement ONE small performance improvement that makes the application measurably faster or more efficient". This is a textbook example. 5 re-renders per second of 500 DOM nodes vs 0 re-renders of the big list.

Let's double check if we can cleanly implement this.

```tsx
<<<<<<< SEARCH
  const buildFirstParagraph = (html: string) => {
    const text = stripTags(html);
    if (!text || text.length === 0) return html;
    const bigSize = Math.round(fontSize * 1.8);
    return html.replace(
      /(<p[^>]*>(?:\s*<[^/][^>]*>)*)([A-Za-z\u00C0-\u024F])/,
      `$1<span style="font-size:${bigSize}px;font-weight:600;line-height:1">${"$2"}</span>`,
    );
  };

  const paragraphsJSX = filteredHtml.map((html, i) => {
    const isEmpty = html === "<p></p>" || html.trim() === "";
    if (isEmpty) return <div key={i} style={{ height: `${paraSpacing}px` }} />;

    const isImage = html.includes("<img ") && !html.includes("<p");
    if (isImage) {
      return (
        <div
          key={i}
          className="reader-image"
          style={{ marginBottom: `${paraSpacing}px`, breakInside: "avoid" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    const isFirst = i === firstTextIndex;
    const renderedHtml = isFirst ? buildFirstParagraph(html) : html;

    // Store original htmlParagraphs index for TTS word lookup
    const originalIdx = i + filterOffset;
    // Subtle opacity dim for paragraphs TTS has already read (live or persisted)
    const isRead = ttsShowReadMark && ttsHighWaterMark >= 0 && (
      ttsParagraphIndex >= 0
        ? (originalIdx < ttsParagraphIndex && originalIdx <= ttsHighWaterMark)
        : originalIdx <= ttsHighWaterMark
    );

    const paraComments = commentsByPara.get(originalIdx);
    const hasComments = commentsEnabled && paraComments && paraComments.length > 0;

    return (
      <div
        key={i}
        data-para-idx={originalIdx}
        className="comment-para-wrap"
        style={{
          marginBottom: `${paraSpacing}px`,
          textIndent: !isFirst && i > 0 ? `${fontSize * 1.5}px` : undefined,
          opacity: isRead ? 0.45 : undefined,
          transition: "opacity 0.4s ease",
          position: "relative",
        }}
      >
        <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        {/* Comment indicator — absolutely positioned, zero layout impact */}
        {commentsEnabled && hasComments && (
          <span
            className="comment-badge"
            data-comment-para={originalIdx}
            onClick={(e) => {
              e.stopPropagation();
              setExpandedCommentPara(expandedCommentPara === originalIdx ? null : originalIdx);
              setAddingCommentPara(null);
              setCommentInput("");
            }}
            style={{
              position: "absolute", right: "4px", top: "0",
              display: "inline-flex", alignItems: "center", gap: "2px",
              cursor: "pointer", opacity: 0.7, transition: "opacity 0.15s ease",
              zIndex: 5,
            }}
          >
            {paraComments!.some((c) => c.author === "ai") && (
              <span style={{
                width: "18px", height: "18px", borderRadius: "50%",
                background: "linear-gradient(135deg, var(--accent-brand), #a78bfa)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px solid rgba(255,255,255,0.1)",
              }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11 6.5 7.5 3 6l3.5-1.5L8 1z" fill="white" opacity="0.9"/><circle cx="4" cy="12" r="1.5" fill="white" opacity="0.5"/><circle cx="12" cy="13" r="1" fill="white" opacity="0.4"/></svg>
              </span>
            )}
            {paraComments!.some((c) => c.author === "user") && (
              <span style={{
                width: "18px", height: "18px", borderRadius: "50%",
                background: "linear-gradient(135deg, rgb(52, 211, 153), rgb(110, 231, 183))",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "1.5px solid rgba(255,255,255,0.1)",
                marginLeft: paraComments!.some((c) => c.author === "ai") ? "-5px" : "0",
              }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 2C5.8 2 4 3.8 4 6s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 9c-3 0-6 1.5-6 3v1h12v-1c0-1.5-3-3-6-3z" fill="black" opacity="0.7"/></svg>
              </span>
            )}
          </span>
        )}
        {/* Add comment icon — absolutely positioned, hidden until hover */}
        {commentsEnabled && !hasComments && (
          <span
            className="comment-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              setAddingCommentPara(addingCommentPara === originalIdx ? null : originalIdx);
              setExpandedCommentPara(null);
              setCommentInput("");
            }}
            style={{
              position: "absolute", right: "4px", top: "0",
              display: "inline-flex", alignItems: "center",
              cursor: "pointer", opacity: 0, transition: "opacity 0.15s ease",
              zIndex: 5,
            }}
          >
            <Plus style={{ width: "12px", height: "12px", color: "var(--text-muted, rgba(255,255,255,0.3))" }} strokeWidth={2} />
          </span>
        )}
      </div>
    );
  });
=======
  const buildFirstParagraph = useCallback((html: string) => {
    const text = stripTags(html);
    if (!text || text.length === 0) return html;
    const bigSize = Math.round(fontSize * 1.8);
    return html.replace(
      /(<p[^>]*>(?:\s*<[^/][^>]*>)*)([A-Za-z\u00C0-\u024F])/,
      `$1<span style="font-size:${bigSize}px;font-weight:600;line-height:1">${"$2"}</span>`,
    );
  }, [fontSize]);

  const paragraphsJSX = useMemo(() => {
    return filteredHtml.map((html, i) => {
      const isEmpty = html === "<p></p>" || html.trim() === "";
      if (isEmpty) return <div key={i} style={{ height: `${paraSpacing}px` }} />;

      const isImage = html.includes("<img ") && !html.includes("<p");
      if (isImage) {
        return (
          <div
            key={i}
            className="reader-image"
            style={{ marginBottom: `${paraSpacing}px`, breakInside: "avoid" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      const isFirst = i === firstTextIndex;
      const renderedHtml = isFirst ? buildFirstParagraph(html) : html;

      // Store original htmlParagraphs index for TTS word lookup
      const originalIdx = i + filterOffset;
      // Subtle opacity dim for paragraphs TTS has already read (live or persisted)
      const isRead = ttsShowReadMark && ttsHighWaterMark >= 0 && (
        ttsParagraphIndex >= 0
          ? (originalIdx < ttsParagraphIndex && originalIdx <= ttsHighWaterMark)
          : originalIdx <= ttsHighWaterMark
      );

      const paraComments = commentsByPara.get(originalIdx);
      const hasComments = commentsEnabled && paraComments && paraComments.length > 0;

      return (
        <div
          key={i}
          data-para-idx={originalIdx}
          className="comment-para-wrap"
          style={{
            marginBottom: `${paraSpacing}px`,
            textIndent: !isFirst && i > 0 ? `${fontSize * 1.5}px` : undefined,
            opacity: isRead ? 0.45 : undefined,
            transition: "opacity 0.4s ease",
            position: "relative",
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          {/* Comment indicator — absolutely positioned, zero layout impact */}
          {commentsEnabled && hasComments && (
            <span
              className="comment-badge"
              data-comment-para={originalIdx}
              onClick={(e) => {
                e.stopPropagation();
                setExpandedCommentPara(prev => prev === originalIdx ? null : originalIdx);
                setAddingCommentPara(null);
                setCommentInput("");
              }}
              style={{
                position: "absolute", right: "4px", top: "0",
                display: "inline-flex", alignItems: "center", gap: "2px",
                cursor: "pointer", opacity: 0.7, transition: "opacity 0.15s ease",
                zIndex: 5,
              }}
            >
              {paraComments!.some((c) => c.author === "ai") && (
                <span style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--accent-brand), #a78bfa)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1.5px solid rgba(255,255,255,0.1)",
                }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11 6.5 7.5 3 6l3.5-1.5L8 1z" fill="white" opacity="0.9"/><circle cx="4" cy="12" r="1.5" fill="white" opacity="0.5"/><circle cx="12" cy="13" r="1" fill="white" opacity="0.4"/></svg>
                </span>
              )}
              {paraComments!.some((c) => c.author === "user") && (
                <span style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: "linear-gradient(135deg, rgb(52, 211, 153), rgb(110, 231, 183))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1.5px solid rgba(255,255,255,0.1)",
                  marginLeft: paraComments!.some((c) => c.author === "ai") ? "-5px" : "0",
                }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 2C5.8 2 4 3.8 4 6s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 9c-3 0-6 1.5-6 3v1h12v-1c0-1.5-3-3-6-3z" fill="black" opacity="0.7"/></svg>
                </span>
              )}
            </span>
          )}
          {/* Add comment icon — absolutely positioned, hidden until hover */}
          {commentsEnabled && !hasComments && (
            <span
              className="comment-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                setAddingCommentPara(prev => prev === originalIdx ? null : originalIdx);
                setExpandedCommentPara(null);
                setCommentInput("");
              }}
              style={{
                position: "absolute", right: "4px", top: "0",
                display: "inline-flex", alignItems: "center",
                cursor: "pointer", opacity: 0, transition: "opacity 0.15s ease",
                zIndex: 5,
              }}
            >
              <Plus style={{ width: "12px", height: "12px", color: "var(--text-muted, rgba(255,255,255,0.3))" }} strokeWidth={2} />
            </span>
          )}
        </div>
      );
    });
  }, [
    filteredHtml,
    firstTextIndex,
    filterOffset,
    fontSize,
    paraSpacing,
    ttsShowReadMark,
    ttsHighWaterMark,
    ttsParagraphIndex,
    commentsEnabled,
    commentsByPara,
    buildFirstParagraph
  ]);
>>>>>>> REPLACE
```

Perfect. The useMemo is correctly set up.
Is there anything else? We have to update `.jules/bolt.md` with the learning.

Oh! `paragraphsJSX` also needs `setExpandedCommentPara`, `setAddingCommentPara`, `setCommentInput` - wait, React state setters are guaranteed stable across renders by React, so we don't need to put them in the dependency array (and eslint plugin react-hooks doesn't complain if they are omitted).
Let's apply the diff to `src/app/reader/components/TextContent.tsx`.
