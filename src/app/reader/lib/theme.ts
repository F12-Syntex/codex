import { THEMES } from "./constants";
import type { ReadingTheme, ThemeClasses } from "./types";

export function getThemeClasses(theme: ReadingTheme): ThemeClasses {
  return THEMES[theme] ?? THEMES.dark;
}
