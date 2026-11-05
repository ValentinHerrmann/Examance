/**
 * Svelte action: sizes an element to the height left in `.app-main` below its top edge, minus the siblings that follow it,
 * the page's bottom padding and the footer (issue #212). Notices that appear above or below then shrink the element instead
 * of making the page scroll. Re-measures on resize and whenever the parent's or the main area's size changes.
 */
export function fillViewport(node: HTMLElement, options: { min?: number } = {}) {
  let min = options.min ?? 352;
  const main = node.closest<HTMLElement>('.app-main');
  if (!main) return {};

  const measure = () => {
    const mainTop = main.getBoundingClientRect().top;
    const top = node.getBoundingClientRect().top - mainTop + main.scrollTop;
    let below = 0;
    for (let el = node.nextElementSibling; el; el = el.nextElementSibling) below += (el as HTMLElement).offsetHeight;
    const gap = Number.parseFloat(getComputedStyle(node.parentElement ?? node).rowGap) || 0;
    if (node.nextElementSibling) below += gap * countSiblingsAfter(node);
    const footer = main.querySelector<HTMLElement>(':scope > footer')?.offsetHeight ?? 0;
    // PageShell's root (`mx-auto w-full`) carries the page's bottom padding.
    const shell = node.closest<HTMLElement>('.mx-auto.w-full');
    const pad = shell ? Number.parseFloat(getComputedStyle(shell).paddingBottom) || 0 : 0;
    const next = Math.max(min, Math.floor(main.clientHeight - top - below - footer - pad));
    if (Math.abs(node.offsetHeight - next) > 1) node.style.height = `${next}px`;
  };

  let frame = 0;
  const schedule = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(main);
  if (node.parentElement) observer.observe(node.parentElement);
  window.addEventListener('resize', schedule);
  measure();

  return {
    update(next: { min?: number } = {}) {
      min = next.min ?? 352;
      schedule();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    },
  };
}

function countSiblingsAfter(node: Element): number {
  let n = 0;
  for (let el = node.nextElementSibling; el; el = el.nextElementSibling) n++;
  return n;
}
