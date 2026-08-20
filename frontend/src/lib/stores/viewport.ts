import { readable, derived, type Readable } from "svelte/store";
import { browser } from "$app/environment";

/**
 * Viewport breakpoint stores.
 *
 * These mirror Tailwind's default breakpoints and exist only for the few places
 * where a narrow screen has to change *behaviour* rather than only styling —
 * the header's slide-over menu, the grading score sheet, the PDF preview's
 * single-pane mode. Anything that is purely visual belongs in a `md:`/`lg:`
 * utility class instead, not here.
 */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/**
 * `true` while the viewport matches `query`. Falls back to `initial` during SSR
 * and prerendering, where `window` does not exist.
 */
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

/**
 * Live viewport width, updated on resize. For the chart wrappers that used to
 * read `window.innerWidth` once on mount and never re-measure.
 */
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
