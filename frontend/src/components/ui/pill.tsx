interface PillProps {
  variant: "live" | "done" | "upcoming" | "warn" | "default";
  children: React.ReactNode;
}

export function Pill({ variant, children }: PillProps) {
  const styles = {
    live: "bg-gradient-to-br from-pink to-bad text-white border-0",
    done: "bg-good/18 text-[#0a8a6b] border-good/25",
    upcoming: "bg-accent/14 text-accent border-accent/20",
    warn: "bg-warn/18 text-[#a06200] border-warn/25",
    default: "bg-white/60 text-ink-2 border-white/60",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border ${styles[variant]}`}
    >
      {variant === "live" && (
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-[pulse-dot_1.4s_infinite]" />
      )}
      {children}
    </span>
  );
}
