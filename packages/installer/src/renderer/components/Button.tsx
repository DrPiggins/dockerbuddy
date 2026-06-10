import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-navy-950 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "bg-whale-500 hover:bg-whale-400 text-navy-950 shadow-[0_8px_24px_rgba(13,183,237,0.35)] focus:ring-whale-400",
  secondary:
    "bg-navy-700 hover:bg-navy-600 text-white border border-navy-600 focus:ring-buddy-500",
  ghost:
    "bg-transparent hover:bg-navy-800 text-whale-200 focus:ring-whale-500",
  danger:
    "bg-rose-500/90 hover:bg-rose-500 text-white focus:ring-rose-400",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
