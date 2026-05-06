import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";

export const metadata: Metadata = {
  title: "Takshashila University · Attendance",
  description: "QR-based attendance management system for Takshashila University",
};

// Inline before-paint script: reads localStorage and applies the saved theme
// to <html> *before* the first paint, so dark-mode users don't see a light
// flash. Mirrors what `applyTheme()` does, but synchronously and small enough
// to inline. Stays in sync with lib/theme/index.ts (key + scale values).
const NO_FLASH_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem("takshashila.theme");
    var t = raw ? JSON.parse(raw) : {};
    var hue = typeof t.hue === "number" ? t.hue : 253;
    var scale = t.fontSize === "small" ? 0.9 : t.fontSize === "large" ? 1.15 : 1;
    var mode = t.mode || "light";
    if (mode === "auto") {
      mode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    var r = document.documentElement;
    r.style.setProperty("--hue", String(hue));
    r.style.setProperty("--font-scale", String(scale));
    r.dataset.theme = mode;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider />
        {children}
      </body>
    </html>
  );
}
