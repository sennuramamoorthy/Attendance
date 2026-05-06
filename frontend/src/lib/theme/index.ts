/**
 * Client-side theme settings (accent hue + font size scale).
 *
 * Persisted to localStorage and applied as inline CSS variables on <html>
 * by ThemeProvider. globals.css declares the default values so SSR is
 * unaffected — the provider only diverges from defaults if the user has
 * saved a preference.
 */

export type FontSize = "small" | "medium" | "large";

export interface ThemeSettings {
  hue: number; // 0–360
  fontSize: FontSize;
}

export const DEFAULT_THEME: ThemeSettings = {
  hue: 253,
  fontSize: "medium",
};

export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

/** Curated hue presets, surfaced in the settings modal as one-click swatches. */
export const HUE_PRESETS = [
  { name: "Aurora", hue: 253 },
  { name: "Ocean", hue: 210 },
  { name: "Forest", hue: 150 },
  { name: "Sunset", hue: 12 },
  { name: "Magenta", hue: 320 },
] as const;

const STORAGE_KEY = "takshashila.theme";

export function loadTheme(): ThemeSettings {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    return {
      hue:
        typeof parsed.hue === "number" && parsed.hue >= 0 && parsed.hue <= 360
          ? parsed.hue
          : DEFAULT_THEME.hue,
      fontSize:
        parsed.fontSize === "small" ||
        parsed.fontSize === "medium" ||
        parsed.fontSize === "large"
          ? parsed.fontSize
          : DEFAULT_THEME.fontSize,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: ThemeSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // localStorage may be unavailable (private mode) — fail silently
  }
}

export function applyTheme(theme: ThemeSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--hue", String(theme.hue));
  root.style.setProperty("--font-scale", String(FONT_SCALE[theme.fontSize]));
}
