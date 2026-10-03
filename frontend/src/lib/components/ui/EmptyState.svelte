<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  interface Props {
    title: string;
    description?: string | undefined;
    icon?: IconDefinition | undefined;
    /** h1 when the empty state is the whole page (one h1 per route). */
    level?: "h1" | "h2";
    class?: string;
    children?: Snippet;
    actions?: Snippet;
  }

  let {
    title,
    description = undefined,
    icon = undefined,
    level = "h2",
    class: className = "",
    children,
    actions,
  }: Props = $props();
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
  {@render children?.()}
  {#if actions}
    <div class="mt-2 flex flex-wrap items-center justify-center gap-2">{@render actions?.()}</div>
  {/if}
</div>
