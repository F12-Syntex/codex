## 2025-02-14 - Optimize Search Filtering by Memoizing Search Strings

**Learning:** When dealing with searches, calling `.toLowerCase()` on properties like `title` and `author` inside `filter` runs `O(N * C)` times (where N is the number of items and C is the number of characters typed) or worse since the array is re-iterated on each keypress. I discovered this specific performance anti-pattern within `src/components/search-overlay.tsx`. While Next.js provides great optimizations, the React logic recalculates searchable strings needlessly.

**Action:** Pre-compute the lowercased searchable string within the items array initialization (`allItems`) using `\0` as a delimiter (per the memory guidelines). Then perform a single `.includes()` check against this pre-computed string during filtering to significantly improve performance.

