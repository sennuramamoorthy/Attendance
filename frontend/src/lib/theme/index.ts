/**
 * Client-side theme settings (mode + accent hue + font size scale).
 *
 * Persisted to localStorage and applied as inline CSS variables (and a
 * `data-theme` attribute) on <html>. globals.css declares the default
 * light values; [data-theme='dark'] overrides them. The pre-paint script
 * in layout.tsx applies the saved mode synchronously before first paint
 * so users don't see a light flash before dark mode kicks in.
 */

export type FontSize = "small" | "medium" | "large";
export type Mode = "light" | "dark" | "auto";

export interface ThemeSettings {
  hue: number; // 0–360
  fontSize: FontSize;
  mode: Mode;
}

export const DEFAULT_THEME: ThemeSettings = {
  hue: 253,
  fontSize: "medium",
  mode: "light",
};

export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

export const HUE_PRESETS = [
  { name: "Aurora", hue: 253 },
  { name: "Ocean", hue: 210 },
  { name: "Forest", hue: 150 },
  { name: "Sunset", hue: 12 },
  { name: "Magenta", hue: 320 },
] as const;

export const STORAGE_KEY = "takshashila.theme";

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
      mode:
        parsed.mode === "light" ||
        parsed.mode === "dark" ||
        parsed.mode === "auto"
          ? parsed.mode
          : DEFAULT_THEME.mode,
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

function effectiveMode(mode: Mode): "light" | "dark" {
  if (mode === "auto") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

export function applyTheme(theme: ThemeSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--hue", String(theme.hue));
  root.style.setProperty("--font-scale", String(FONT_SCALE[theme.fontSize]));
  root.dataset.theme = effectiveMode(theme.mode);
}
