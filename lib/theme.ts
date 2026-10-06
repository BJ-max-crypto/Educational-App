export const THEMES = [
  { id: "colorful", label: "Colorful" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export type PaneTheme = (typeof THEMES)[number]["id"];

export const THEME_KEY = "pane-theme";

const THEME_COLORS: Record<PaneTheme, string> = {
  colorful: "#eef3fb",
  light: "#ffffff",
  dark: "#101218",
};

export function isPaneTheme(value: string | null): value is PaneTheme {
  return value === "colorful" || value === "light" || value === "dark";
}

export function readTheme(): PaneTheme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isPaneTheme(stored)) return stored;
  } catch {
    // Private browsing can block storage. Colorful stays the default.
  }
  return "colorful";
}

/** Applies a theme before paint. Colorful is the original look, so it clears the attribute. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")return;document.documentElement.setAttribute("data-theme",t);var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",t==="dark"?"${THEME_COLORS.dark}":"${THEME_COLORS.light}");}catch(e){}})();`;

export function applyTheme(theme: PaneTheme) {
  const root = document.documentElement;
  if (theme === "colorful") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export function storeTheme(theme: PaneTheme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Still apply for this visit when storage is blocked.
  }
  applyTheme(theme);
}
