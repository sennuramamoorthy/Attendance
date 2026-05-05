interface ProgressRingProps {
  percentage: number;
  size?: number;
  label?: string;
}

export function ProgressRing({ percentage, size = 120, label }: ProgressRingProps) {
  return (
    <div
      className="rounded-full grid place-items-center relative"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--accent) ${percentage}%, rgba(255,255,255,0.5) 0)`,
      }}
    >
      <div className="absolute inset-3 bg-white/85 backdrop-blur-[10px] rounded-full" />
      <div className="relative text-center">
        <div className="text-2xl font-extrabold">{Math.round(percentage)}%</div>
        {label && (
          <div className="text-[10px] text-muted font-semibold uppercase tracking-[0.1em] mt-0.5">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
