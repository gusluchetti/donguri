/** Check if an input-like element is focused (for sequence guards). */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export interface ShortcutDef {
  /** Key labels for display (each element = one keycap). */
  keys: string[];
  description: string;
}

export interface ShortcutSection {
  title: string;
  shortcuts: ShortcutDef[];
}

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["?"], description: "This help" },
      { keys: ["g h"], description: "Go Home" },
      { keys: ["g c"], description: "Go Catalog" },
      { keys: ["g b"], description: "Go Blog" },
      { keys: ["g r"], description: "Go Roadmap" },
      { keys: ["g p"], description: "Go Profile" },
      { keys: ["."], description: "Toggle theme" },
    ],
  },
  {
    title: "Catalog",
    shortcuts: [
      { keys: ["j / ↓", "k / ↑"], description: "Cursor down / up" },
      { keys: ["Enter", "l / →"], description: "Open item" },
      { keys: ["/"], description: "Search" },
      { keys: ["Esc"], description: "Blur / deselect" },
      { keys: ["g g", "G"], description: "First / last item" },
      {
        keys: ["f f", "f m", "f t", "f a", "f g"],
        description: "Filter: all / movie / tv / anime / game",
      },
      { keys: ["a"], description: "Quick-add" },
    ],
  },
  {
    title: "Detail",
    shortcuts: [
      { keys: ["h / ←"], description: "Go back" },
      { keys: ["f"], description: "Favorite" },
      { keys: ["s"], description: "Save" },
      { keys: ["D"], description: "Delete" },
      { keys: ["p", "w", "o", "c", "d", "m"], description: "Set status" },
      { keys: ["= N"], description: "Set rating (0–100)" },
    ],
  },
];
