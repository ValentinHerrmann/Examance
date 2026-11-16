<script lang="ts">
  import type { Snippet } from "svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  /** Label + control + optional hint/error. Without `forId` an id is generated and passed to children. */
  interface Props {
    label?: string | undefined;
    forId?: string | undefined;
    hint?: string | undefined;
    /** A longer explanation behind an info icon next to the label (keeps the form short). */
    info?: string | undefined;
    error?: string | undefined;
    required?: boolean;
    /** Dense forms: small label, tighter gap (pair with `controlCompactClass`). */
    compact?: boolean;
    class?: string;
    children?: Snippet<[{ id: string }]>;
  }

  let {
    label = undefined,
    forId = undefined,
    hint = undefined,
    info = undefined,
    error = undefined,
    required = false,
    compact = false,
    class: className = "",
    children,
  }: Props = $props();

  const generated = `field-${Math.random().toString(36).slice(2, 10)}`;
  let id = $derived(forId ?? generated);
</script>

<div class="flex min-w-0 flex-col {compact ? 'gap-1' : 'gap-1.5'} {className}">
  {#if label}
    <div class="flex min-w-0 items-center gap-1">
      <label class="{compact ? 'text-xs' : 'text-sm'} font-medium text-content" for={id}
        >{label}{#if required}<span class="ml-0.5 text-danger-fg" aria-hidden="true">*</span>{/if}</label
      >
      <!-- The negative margin cancels the button's extra height, so a label with ⓘ is as high as one without and inputs in a row line up. -->
      {#if info}<InfoTip text={info} class={compact ? "-my-1 pointer-coarse:-my-3.5" : "-my-0.5 pointer-coarse:-my-3"} />{/if}
    </div>
  {/if}
  {@render children?.({ id })}
  {#if error}
    <p class="m-0 text-sm text-danger-fg" role="alert">{error}</p>
  {:else if hint}
    <p class="m-0 text-sm text-muted">{hint}</p>
  {/if}
</div>
