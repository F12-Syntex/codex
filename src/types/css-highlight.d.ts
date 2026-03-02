// CSS Custom Highlight API — supported in Chromium 105+
// https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API

interface Highlight extends Set<AbstractRange> {
  priority: number;
  type: "highlight" | "spelling-error" | "grammar-error";
  new (...ranges: AbstractRange[]): Highlight;
}

declare const Highlight: {
  prototype: Highlight;
  new (...ranges: AbstractRange[]): Highlight;
};

interface HighlightRegistry extends Map<string, Highlight> {}

declare namespace CSS {
  const highlights: HighlightRegistry;
}
