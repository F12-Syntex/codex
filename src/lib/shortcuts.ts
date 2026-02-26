export interface ShortcutDefinition {
  id: string;
  label: string;
  keys: string;
  category: string;
}

export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  { id: "search", label: "Open Search", keys: "Ctrl+K", category: "General" },
  { id: "import", label: "Import", keys: "Ctrl+I", category: "General" },
  { id: "toggle-sidebar", label: "Toggle Sidebar", keys: "Ctrl+B", category: "Navigation" },
  { id: "switch-books", label: "Switch to Books", keys: "Ctrl+1", category: "Navigation" },
  { id: "switch-comic", label: "Switch to Comics", keys: "Ctrl+2", category: "Navigation" },
  { id: "grid-view", label: "Grid View", keys: "Ctrl+Shift+G", category: "View" },
  { id: "list-view", label: "List View", keys: "Ctrl+Shift+L", category: "View" },
];

export interface ParsedKeys {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export function parseKeys(keys: string): ParsedKeys {
  const parts = keys.split("+");
  return {
    ctrl: parts.includes("Ctrl"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
    key: parts[parts.length - 1].toLowerCase(),
  };
}

export function matchesShortcut(event: KeyboardEvent, parsed: ParsedKeys): boolean {
  return (
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    event.key.toLowerCase() === parsed.key
  );
}
