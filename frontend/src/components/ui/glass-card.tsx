import { type ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  padding?: "default" | "sm" | "none";
}

export function GlassCard({
  children,
  className = "",
  padding = "default",
}: GlassCardProps) {
  const padClass =
    padding === "default"
      ? "p-5"
      : padding === "sm"
        ? "px-4 py-3.5"
        : "";

  return (
    <div
      className={`bg-[var(--glass)] border border-white/70 rounded-[var(--radius)] backdrop-blur-[20px] shadow-[var(--shadow)] ${padClass} ${className}`}
    >
      {children}
    </div>
  );
}
