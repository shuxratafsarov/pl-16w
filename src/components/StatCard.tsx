import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: "default" | "primary" | "success" | "destructive" | "warning" | "cainiao" | "mpo" | "mko";
  icon?: ReactNode;
}) {
  const iconBg: Record<string, string> = {
    default: "gradient-primary",
    primary: "gradient-primary",
    success: "gradient-success",
    destructive: "gradient-danger",
    warning: "gradient-warn",
    cainiao: "gradient-primary",
    mpo: "gradient-primary",
    mko: "gradient-primary",
  };
  return (
    <div className="group relative overflow-hidden rounded-2xl glass-card p-5 shadow-elegant transition-all duration-300 hover:shadow-elevated hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <p className="text-[26px] leading-tight font-bold tracking-tight text-card-foreground tabular-nums">
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-glow",
              iconBg[accent]
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
