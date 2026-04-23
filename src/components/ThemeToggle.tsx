import { useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card text-card-foreground transition-colors hover:bg-accent"
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
