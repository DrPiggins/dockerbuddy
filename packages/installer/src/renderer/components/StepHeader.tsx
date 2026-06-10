import { ReactNode } from "react";

export function StepHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 mb-8">
      {icon && <div className="shrink-0 mt-1">{icon}</div>}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-whale-200/80 mt-2 text-sm leading-relaxed max-w-prose">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i < step
              ? "w-8 bg-whale-400"
              : i === step
                ? "w-12 bg-buddy-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]"
                : "w-8 bg-navy-700"
          }`}
        />
      ))}
    </div>
  );
}
