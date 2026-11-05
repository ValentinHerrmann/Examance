<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /** One choice of a radio group as a bordered tile (icon, title, one short line), highlighted while selected: Settings and the Print step. */
  interface Props {
    name: string;
    value: string;
    checked: boolean;
    title: string;
    /** The short grey line under the title. */
    text?: string | undefined;
    icon?: IconDefinition | undefined;
    disabled?: boolean;
    /** `compact`: smaller padding and text, for tiles side by side in a dense card. */
    compact?: boolean;
    onchange?: (event: Event) => void;
    /** For gated choices: call `preventDefault()` to keep the selection until the change is committed. */
    onclick?: (event: MouseEvent) => void;
    /** After the title, e.g. an `InfoTip`. */
    titleExtra?: Snippet;
    class?: string;
  }

  let { name, value, checked, title, text = undefined, icon = undefined, disabled = false, compact = false, onchange, onclick, titleExtra, class: className = "" }: Props = $props();
</script>

<label
  class="flex min-w-0 items-start rounded-md border border-line-strong bg-surface-sunken has-[:checked]:border-primary has-[:checked]:bg-highlight {compact
    ? 'gap-2 p-2.5'
    : 'gap-3 p-4'} {disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-hover'} {className}"
>
  <input class="mt-0.5 shrink-0 cursor-[inherit] accent-primary {compact ? 'size-4' : 'size-5'}" type="radio" {name} {value} {checked} {disabled} {onchange} {onclick} />
  <span class="min-w-0">
    <span class="flex items-center gap-1.5 font-medium text-content {compact ? 'text-sm' : 'text-base'}">
      {#if icon}<Icon {icon} class="shrink-0 text-muted" />{/if}<span class="min-w-0">{title}</span>{@render titleExtra?.()}
    </span>
    {#if text}<span class="block text-muted {compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'}">{text}</span>{/if}
  </span>
</label>
