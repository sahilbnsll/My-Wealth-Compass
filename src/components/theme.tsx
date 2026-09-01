import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ThemeChoice = "light" | "dark";

const STORAGE_KEY = "sii.theme";

/** Runs before paint. Light is the deliberate default for a calm first visit. */
export const themeInitScript = `(function(){try{var c=localStorage.getItem("${STORAGE_KEY}")||"light";var d=document.documentElement;d.style.colorScheme=c;d.classList.toggle("dark",c==="dark");}catch(e){}})();`;

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  root.style.colorScheme = choice;
  root.classList.toggle("dark", choice === "dark");
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("light");
  const [resolved, setResolved] = useState<ThemeChoice>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const next: ThemeChoice = stored === "dark" ? "dark" : "light";
    setChoice(next);
    setResolved(next);
    apply(next);
  }, []);

  const set = useCallback((next: ThemeChoice) => {
    // The document shell is the only element animated. Transitioning every
    // node (especially SVG charts) makes a theme swap noticeably janky on
    // larger portfolios because it forces a full style/repaint pass.
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const commit = () => {
      root.dataset["themeChanging"] = "true";
      apply(next);
      window.setTimeout(() => root.removeAttribute("data-theme-changing"), 180);
    };
    setChoice(next);
    setResolved(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the choice stays session-only */
    }
    const withViewTransition = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    // Native view transitions are composited by the browser, so large charts
    // don't need to animate every individual SVG element. The short CSS
    // fallback covers browsers that do not support the API.
    if (!reduceMotion && withViewTransition.startViewTransition) {
      void withViewTransition.startViewTransition(commit).finished.catch(() => undefined);
    } else {
      commit();
    }
  }, []);

  return { choice, resolved, set };
}

/**
 * Single-button theme switcher: light → dark → light.
 * The icon reflects the *destination*: moon while light, sun while dark.
 */
export function ThemeToggle({ choice, onChange }: { choice: ThemeChoice; onChange: (c: ThemeChoice) => void }) {
  const next: ThemeChoice = choice === "dark" ? "light" : "dark";
  const Icon = choice === "dark" ? Sun : Moon;
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onChange(next)}
            aria-label={`Switch to ${next} theme`}
            className="min-h-11 min-w-11 border-border-subtle bg-surface-2 text-[color:var(--text-secondary)] hover:text-foreground"
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Switch to {next}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
