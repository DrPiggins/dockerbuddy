import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl bg-navy-900/80 backdrop-blur border border-navy-700/60 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
