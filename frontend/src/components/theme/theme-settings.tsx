"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  applyTheme,
  DEFAULT_THEME,
  type FontSize,
  HUE_PRESETS,
  loadTheme,
  saveTheme,
  type ThemeSettings,
} from "@/lib/theme";

interface ThemeSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const FONT_OPTIONS: { value: FontSize; label: string; sample: string }[] = [
  { value: "small", label: "Small", sample: "Aa" },
  { value: "medium", label: "Default", sample: "Aa" },
  { value: "large", label: "Large", sample: "Aa" },
];

export function ThemeSettingsModal({ open, onClose }: ThemeSettingsModalProps) {
  // Render the content only when open so its useState initializer runs
  // fresh each time. Avoids the React 19 set-state-in-effect lint trap.
  return (
    <Modal open={open} onClose={onClose} title="Theme">
      {open && <ThemeSettingsContent onClose={onClose} />}
    </Modal>
  );
}

function ThemeSettingsContent({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<ThemeSettings>(() => loadTheme());

  function update(partial: Partial<ThemeSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    applyTheme(next); // live preview
    saveTheme(next);
  }

  function reset() {
    setSettings(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    saveTheme(DEFAULT_THEME);
  }

  return (
    <div className="space-y-5">
      {/* Accent hue */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">
              Accent color
            </label>
            <span
              className="w-7 h-7 rounded-lg border border-white/70 shadow-sm"
              style={{ background: `hsl(${settings.hue}, 100%, 65%)` }}
              aria-label="Current accent"
            />
          </div>

          {/* Preset swatches */}
          <div className="flex gap-2 mb-3">
            {HUE_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => update({ hue: p.hue })}
                className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl border ${
                  Math.abs(settings.hue - p.hue) < 5
                    ? "border-accent/50 bg-white/70"
                    : "border-white/70 bg-white/40 hover:bg-white/60"
                }`}
                title={p.name}
              >
                <span
                  className="w-7 h-7 rounded-full"
                  style={{ background: `hsl(${p.hue}, 100%, 65%)` }}
                />
                <span className="text-[10px] text-muted font-semibold">
                  {p.name}
                </span>
              </button>
            ))}
          </div>

          {/* Hue slider for fine control */}
          <input
            type="range"
            min={0}
            max={360}
            value={settings.hue}
            onChange={(e) => update({ hue: parseInt(e.target.value) })}
            className="w-full h-2 rounded-full cursor-pointer appearance-none"
            style={{
              background:
                "linear-gradient(to right," +
                "hsl(0,100%,65%)," +
                "hsl(60,100%,65%)," +
                "hsl(120,100%,65%)," +
                "hsl(180,100%,65%)," +
                "hsl(240,100%,65%)," +
                "hsl(300,100%,65%)," +
                "hsl(360,100%,65%))",
            }}
          />
          <p className="text-[11px] text-muted mt-1.5 font-mono">
            hue: {settings.hue}°
          </p>
        </div>

        {/* Font size */}
        <div>
          <label className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 block">
            Font size
          </label>
          <div className="grid grid-cols-3 gap-2">
            {FONT_OPTIONS.map((opt) => {
              const active = settings.fontSize === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => update({ fontSize: opt.value })}
                  className={`flex flex-col items-center justify-center py-3 rounded-xl border ${
                    active
                      ? "border-accent/50 bg-white/70"
                      : "border-white/70 bg-white/40 hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`font-bold text-ink ${
                      opt.value === "small"
                        ? "text-base"
                        : opt.value === "medium"
                          ? "text-xl"
                          : "text-2xl"
                    }`}
                  >
                    {opt.sample}
                  </span>
                  <span className="text-[10px] text-muted font-semibold mt-0.5">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      <div className="flex justify-between items-center pt-2 border-t border-white/70">
        <button
          onClick={reset}
          className="text-xs font-semibold text-muted hover:text-ink"
        >
          Reset to defaults
        </button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
