/**
 * Reads a design token at runtime, for the few places that paint with a canvas
 * or a third-party API instead of CSS (scan placeholders, chart export). The
 * value follows the active theme because the tokens are live CSS variables.
 *
 * Read it at draw time, not once at module load, or a theme switch is missed.
 */
export function cssVar(name: string, fallback = ''): string {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}
