<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  export let title: string;
  export let description: string | undefined = undefined;
  export let icon: IconDefinition | undefined = undefined;
  /** h1 when the empty state is the whole page (one h1 per route). */
  export let level: "h1" | "h2" = "h2";

  let className = "";
  export { className as class };
</script>

<div class="flex min-w-0 flex-col items-center gap-3 px-4 py-10 text-center {className}">
  {#if icon}
    <div class="flex size-14 items-center justify-center rounded-xl border border-line-strong text-2xl text-primary">
      <Icon {icon} />
    </div>
  {/if}
  {#if level === "h1"}
    <h1 class="m-0 text-xl font-semibold text-content">{title}</h1>
  {:else}
    <h2 class="m-0 text-xl font-semibold text-content">{title}</h2>
  {/if}
  {#if description}<p class="m-0 max-w-[40rem] text-muted">{description}</p>{/if}
  <slot />
  {#if $$slots.actions}
    <div class="mt-2 flex flex-wrap items-center justify-center gap-2"><slot name="actions" /></div>
  {/if}
</div>
