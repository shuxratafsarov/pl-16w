import { cn } from "@/lib/utils";

type Status = "ok" | "warning" | "critical";

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const text = label ?? (status === "ok" ? "Норма" : status === "warning" ? "Внимание" : "Критично");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "ok" && "bg-success/10 text-success",
        status === "warning" && "bg-warning/15 text-warning",
        status === "critical" && "bg-destructive/10 text-destructive"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "ok" && "bg-success",
          status === "warning" && "bg-warning",
          status === "critical" && "bg-destructive"
        )}
      />
      {text}
    </span>
  );
}
