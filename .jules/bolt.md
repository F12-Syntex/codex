## 2024-05-14 - Empty array fallback causing unnecessary re-renders
**Learning:** Initializing default fallback arrays inline (e.g., `data ?? []` or `prop = []`) creates a new array reference on every render, which can defeat memoization or trigger unnecessary cascading re-renders in child components.
**Action:** Extract empty fallback arrays into module-level constants (e.g., `const EMPTY_ARRAY = [];`) to maintain a stable reference across renders and preserve memoization.

## 2024-05-14 - Case-insensitive array filtering performance
**Learning:** When filtering or sorting large arrays by text on every keystroke, calling `.toLowerCase()` inside the filter loop allocates memory and takes CPU time for every item.
**Action:** Pre-compute lowercased searchable strings on the items (e.g., during array construction or in a `useMemo` that only runs when the array items change, not the search query) to minimize garbage collection pressure and prevent UI lag.
