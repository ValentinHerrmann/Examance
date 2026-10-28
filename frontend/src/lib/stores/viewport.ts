import { readable, type Readable } from "svelte/store";
import { browser } from "$app/env";

/**
 * Viewport breakpoint stores mirroring Tailwind's defaults, only for places where a narrow screen must
 * change *behaviour* (header slide-over, grading score sheet, PDF preview single-pane). Purely visual
 * changes belong in `md:`/`lg:` classes.
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** `true` while the viewport matches `query`; `initial` during SSR/prerender (no `window`). */
export function mediaQuery(query: string, initial = false): Readable<boolean> {
  return readable(initial, (set) => {
    if (!browser) {
      return;
    }

    const mql = window.matchMedia(query);
    set(mql.matches);

    const onChange = (event: MediaQueryListEvent) => set(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  });
}

/** `true` from `bp` upwards, matching the Tailwind variant of the same name. */
export function minWidth(bp: Breakpoint, initial = false): Readable<boolean> {
  return mediaQuery(`(min-width: ${breakpoints[bp]}px)`, initial);
}

/** `lg` and up — where the multi-column desktop layouts apply. */
export const isDesktop = minWidth("lg", true);

