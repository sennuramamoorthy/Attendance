import { type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "dark";
}

export function Button({
  variant = "default",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12.5px] font-semibold cursor-pointer transition-colors";

  const styles = {
    default:
      "border border-white/70 bg-white/60 text-ink backdrop-blur-[10px] hover:bg-white/85",
    primary:
      "bg-gradient-to-br from-accent to-accent-2 text-white border-0 shadow-[0_10px_22px_rgba(109,76,255,0.3)]",
    dark: "bg-ink text-white border-0",
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
