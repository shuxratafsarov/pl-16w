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
  const accentBar: Record<string, string> = {
    default: "bg-border",
    primary: "bg-primary",
    success: "bg-success",
    destructive: "bg-destructive",
    warning: "bg-warning",
    cainiao: "bg-cainiao",
    mpo: "bg-mpo",
    mko: "bg-mko",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className={cn("absolute left-0 top-0 h-full w-1", accentBar[accent])} />
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-card-foreground tabular-nums">
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
    </div>
  );
}
