interface AvatarProps {
  name: string;
  variant?: "default" | "blue" | "pink" | "green";
  size?: "sm" | "md" | "lg";
}

export function Avatar({ name, variant = "default", size = "md" }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const gradients = {
    default: "bg-gradient-to-br from-accent to-pink",
    blue: "bg-gradient-to-br from-accent-2 to-accent",
    pink: "bg-gradient-to-br from-pink to-amber",
    green: "bg-gradient-to-br from-good to-accent-2",
  };

  const sizes = {
    sm: "w-8 h-8 text-[11px]",
    md: "w-10 h-10 text-xs",
    lg: "w-12 h-12 text-sm",
  };

  return (
    <div
      className={`rounded-full text-white grid place-items-center font-bold ${gradients[variant]} ${sizes[size]}`}
    >
      {initials}
    </div>
  );
}
