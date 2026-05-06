"use client";

import { useEffect } from "react";
import { applyTheme, loadTheme } from "@/lib/theme";

/**
 * Reads saved theme settings on mount and applies them as CSS variables on
 * <html>. Renders nothing — purely a side-effect component. Keep mounted
 * once near the root of the tree.
 */
export function ThemeProvider() {
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);
  return null;
}
