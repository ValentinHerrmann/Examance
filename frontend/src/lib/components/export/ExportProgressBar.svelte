<script lang="ts">
  /** Progress of a running export; no fraction = indeterminate (the step count is unknown, e.g. while compiling). */
  interface Props {
    step: string;
    fraction: number | null;
    class?: string;
  }

  let { step, fraction, class: className = "" }: Props = $props();

  const progressClass =
    "block h-3 w-full appearance-none overflow-hidden rounded-md bg-surface-inset [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-inset [&::-webkit-progress-value]:bg-primary";
</script>

<div class={className} aria-live="polite">
  {#if fraction === null}
    <progress class={progressClass} aria-label={step}></progress>
  {:else}
    <progress class={progressClass} aria-label={step} max="100" value={Math.round(fraction * 100)}></progress>
  {/if}
  <p class="mt-2 text-sm text-muted">{step}</p>
</div>
