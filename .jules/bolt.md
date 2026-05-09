## 2024-05-18 - Missing memoization for expensive loop components
**Learning:** Found several components where `toLowerCase()` is being called inside a loop over and over, typically within `.filter()` when searching large datasets. It also creates a lot of unnecessary closures and calls inside the `.map()` block inline without memoization.
**Action:** Always pre-compute lowercase values and memoize the filtered lists in React components to avoid re-evaluating these expensive operations on every render or every keystroke. Use `useMemo`.
## 2024-05-18 - Missing memoization for expensive filter logic
**Learning:** Found an instance in `src/app/reader/components/TTSPanel.tsx` where `.filter` with `toLowerCase()` is being called inside the render loop for `voices.filter(...)` instead of being memoized using `useMemo`. This creates a new array on every render and computes the filter logic repeatedly.
**Action:** Extract the `.filter` operation into a `useMemo` hook to avoid recalculating the filtered list on every render, especially when the search query or the base array doesn't change.

## 2024-05-18 - Missing memoization for expensive filter logic
**Learning:** Found an instance in `src/app/reader/components/TTSPanel.tsx` where `.filter` with `toLowerCase()` is being called inside the render loop for `voices.filter(...)` instead of being memoized using `useMemo`. This creates a new array on every render and computes the filter logic repeatedly.
**Action:** Extract the `.filter` operation into a `useMemo` hook to avoid recalculating the filtered list on every render, especially when the search query or the base array doesn't change.
