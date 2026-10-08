/**
 * Background scroll lock for dialogs and drawers. `.app-main` scrolls, not the document (routes/+layout.css), so it is
 * locked rather than `body`. Ref-counted so closing a top dialog doesn't unlock the page under a lower one; padded by its
 * scrollbar width so content doesn't shift.
 */

const SCROLLER_SELECTOR = '.app-main';

let count = 0;
let locked: { el: HTMLElement; overflow: string; paddingRight: string } | null = null;

function scroller(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>(SCROLLER_SELECTOR) ?? document.body;
}

/** Takes one lock. Returns the matching release; calling it twice is a no-op. */
export function lockScroll(): () => void {
    count += 1;
    if (count === 1) {
        const el = scroller();
        if (el) {
            const scrollbar = el.offsetWidth - el.clientWidth;
            locked = { el, overflow: el.style.overflow, paddingRight: el.style.paddingRight };
            if (scrollbar > 0) {
                const current = parseFloat(getComputedStyle(el).paddingRight) || 0;
                el.style.paddingRight = `${current + scrollbar}px`;
            }
            el.style.overflow = 'hidden';
            el.dataset.scrollLocked = '';
        }
    }

    let released = false;
    return () => {
        if (released) return;
        released = true;
        count = Math.max(0, count - 1);
        if (count === 0 && locked) {
            locked.el.style.overflow = locked.overflow;
            locked.el.style.paddingRight = locked.paddingRight;
            delete locked.el.dataset.scrollLocked;
            locked = null;
        }
    };
}

/** Number of active locks. For tests. */
export function scrollLockCount(): number {
    return count;
}
