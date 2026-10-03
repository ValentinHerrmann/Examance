<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

  /**
   * FontAwesome Free (solid) icon, rendered as inline SVG from the icon's path
   * data. No FontAwesome runtime and no icon font: each call site imports only
   * the icons it uses (`import { faXmark } from "@fortawesome/free-solid-svg-icons"`)
   * and the bundler tree-shakes the rest.
   *
   * Sized by font-size (1em tall) and coloured by `currentColor`, so it follows
   * the text it sits in.
   */
  export let icon: IconDefinition;
  /** Accessible name. Without it the icon is decorative and hidden from AT. */
  export let label: string | undefined = undefined;
  export let spin = false;

  let className = "";
  export { className as class };

  $: [width, height, , , pathData] = icon.icon;
  $: paths = Array.isArray(pathData) ? pathData : [pathData];
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
