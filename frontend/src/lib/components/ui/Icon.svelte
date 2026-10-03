<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

  /**
   * FontAwesome Free (solid) icon as inline SVG from the icon's path data (no runtime, no font;
   * call sites import only the icons they use). Sized 1em tall, coloured by `currentColor`.
   */
  interface Props {
    icon: IconDefinition;
    /** Accessible name. Without it the icon is decorative and hidden from AT. */
    label?: string | undefined;
    spin?: boolean;
    class?: string;
  }

  let { icon, label = undefined, spin = false, class: className = "" }: Props = $props();

  let width = $derived(icon.icon[0]);
  let height = $derived(icon.icon[1]);
  let pathData = $derived(icon.icon[4]);
  let paths = $derived(Array.isArray(pathData) ? pathData : [pathData]);
</script>

<svg
  viewBox="0 0 {width} {height}"
  class="inline-block h-[1em] w-auto shrink-0 fill-current align-[-0.125em] {spin
    ? 'animate-spin'
    : ''} {className}"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
  focusable="false"
>
  {#each paths as d}
    <path {d} />
  {/each}
</svg>
