/*
 * Theme switching (light / dark / system). Presentation-only (STACK-5/7). The DB `settings.theme` is the
 * durable, cross-device source of truth; this provider is the client-side applier. A `wikain-theme`
 * cookie mirrors the choice so two things can read it synchronously with no server round-trip: the
 * pre-paint inline script in `__root.tsx` (the flash-free guarantee) and this provider's initial state
 * (so the React tree agrees with the already-painted DOM — hence no hydration flicker).
 *
 * `system` is resolved to an effective light/dark against `prefers-color-scheme` and re-resolves live
 * when the OS scheme flips. `_authenticated.tsx` reconciles the DB value into here on load, which is what
 * makes the preference follow the user to a new device where the cookie is absent.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { THEME_DEFAULT } from "~/domain/constants.js";
import { type Theme, isValidTheme } from "~/domain/theme.js";

const COOKIE_NAME = "wikain-theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** The same cookie-parse the inline script does, reused so provider state matches the painted DOM. */
function readCookieTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)wikain-theme=([^;]+)/);
  const value = match?.[1];
  return isValidTheme(value) ? value : null;
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolve `system` and toggle the `.dark` class + `color-scheme` on <html> — the one place that mutates it. */
function applyEffective(theme: Theme): void {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readCookieTheme() ?? THEME_DEFAULT);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof document !== "undefined") {
      document.cookie = `${COOKIE_NAME}=${next};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    }
    applyEffective(next); // apply immediately so the switch feels instant, ahead of the effect
  }, []);

  useEffect(() => {
    applyEffective(theme);
    // Only `system` tracks the OS; a pinned light/dark ignores scheme changes by design.
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyEffective("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * The exact pre-paint script rendered inline in <head> (`__root.tsx`). It sets the theme class before the
 * body paints, so there is no light flash on any route incl. signed-out pages. Kept as a string constant
 * next to `applyEffective` so the two stay in lockstep — the inline script is intentionally dependency-free
 * (it runs before the bundle) so it cannot import the helper.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)wikain-theme=([^;]+)/);var t=m&&m[1];if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
