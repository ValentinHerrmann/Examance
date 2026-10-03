/**
 * Reads a design token at runtime for canvas/third-party painting (scan placeholders, chart export).
 * Read it at draw time, not at module load, or a theme switch is missed.
 */
export function cssVar(name: string, fallback = ''): string {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}
