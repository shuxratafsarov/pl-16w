import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function SectionCard({
  title,
  description,
  children,
  action,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-2xl glass-card p-6 shadow-elegant scroll-mt-24", className)}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          {typeof title === "string" ? (
            <h2 className="text-base font-semibold tracking-tight text-card-foreground">{title}</h2>
          ) : (
            title
          )}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Подробнее"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs bg-popover text-popover-foreground border shadow-md">
                <p className="text-xs leading-relaxed">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
