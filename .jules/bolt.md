## 2025-02-17 - [Initial Learning]
**Learning:** Understanding React performance patterns in this Electron app
**Action:** Found multiple areas where `useMemo` and `useCallback` are heavily used.

## 2025-02-17 - [Initial Learning]
**Learning:** BookCard runs an expensive color extraction logic repeatedly on image load (`extractDominantColor`). This iterates over image pixels every time a cover is loaded.
**Action:** Since BookCard is memoized, we should make sure that this extraction function doesn't cause unnecessary bottlenecks, or we can look for other bottlenecks.

## 2025-02-17 - [Precomputing Search Filters]
**Learning:** React search overlays parsing datasets compute `.toLowerCase()` multiple times across filter methods and highlight match maps.
**Action:** Always precompute `.toLowerCase()` and add them directly to the map context to avoid string instantiation pressure and lower iteration latency during UI interactions.
