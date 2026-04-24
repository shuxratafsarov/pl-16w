import { useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-card-foreground shadow-sm transition-all",
        "hover:bg-accent hover:shadow-md hover:scale-105 active:scale-95"
      )}
    >
      <Sun className={cn("h-4 w-4 transition-all", theme === "light" ? "rotate-0 scale-100" : "rotate-90 scale-0 absolute")} />
      <Moon className={cn("h-4 w-4 transition-all", theme === "dark" ? "rotate-0 scale-100" : "-rotate-90 scale-0 absolute")} />
    </button>
  );
}
