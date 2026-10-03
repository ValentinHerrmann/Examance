import { readable, derived, type Readable } from "svelte/store";
import { browser } from "$app/environment";

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

/** Phone-sized: narrower than `md` (768px). */
export const isPhone = derived(minWidth("md", true), ($md) => !$md);

/** Tablet / small laptop: at least `md`, narrower than `lg` (1024px). */
export const isTablet = derived(
  [minWidth("md", true), minWidth("lg", true)],
  ([$md, $lg]) => $md && !$lg,
);

/** `lg` and up — where the multi-column desktop layouts apply. */
export const isDesktop = minWidth("lg", true);

/** Coarse pointer (touch). Used to widen hit areas and enable pinch-zoom. */
export const isTouch = mediaQuery("(pointer: coarse)", false);

/** Live viewport width, updated on resize (for chart wrappers that otherwise measure `window.innerWidth` once on mount). */
export const viewportWidth = readable(1280, (set) => {
  if (!browser) {
    return;
  }

  const update = () => set(window.innerWidth);
  update();

  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("orientationchange", update);
  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
  };
});
