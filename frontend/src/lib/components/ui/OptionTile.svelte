<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { locale } from "#lib/i18n";
  import Icon from "./Icon.svelte";

  /** One choice as a bordered tile (icon, title, one short line), highlighted while selected: a radio of a group, or with `type="checkbox"` an on/off setting. The one look of setting choices (Settings, Exam and Print steps, Send to students, exports). */
  interface Props {
    /** `checkbox`: an on/off setting of its own; `name`/`value` are then optional. */
    type?: "radio" | "checkbox";
    name?: string;
    value?: string;
    checked: boolean;
    title: string;
    /** The short grey line under the title. */
    text?: string | undefined;
    icon?: IconDefinition | undefined;
    disabled?: boolean;
    /** `compact`: smaller padding and text, for tiles side by side in a dense card. */
    compact?: boolean;
    onchange?: (event: Event) => void;
    /** The new state of a checkbox tile (or `true` when a radio tile is chosen). */
    onToggle?: (on: boolean) => void;
    /** For gated choices: call `preventDefault()` to keep the selection until the change is committed. */
    onclick?: (event: MouseEvent) => void;
    /** After the title, e.g. an `InfoTip`. */
    titleExtra?: Snippet;
    class?: string;
  }

  let { type = "radio", name, value, checked, title, text = undefined, icon = undefined, disabled = false, compact = false, onchange, onToggle, onclick, titleExtra, class: className = "" }: Props = $props();

  function changed(event: Event) {
    onchange?.(event);
    onToggle?.((event.currentTarget as HTMLInputElement).checked);
  }
</script>

<!-- `lang` lets long German words hyphenate instead of overflowing a narrow tile. -->
<label
  lang={$locale}
  class="flex h-full min-w-0 items-start rounded-md border border-line-strong bg-surface-sunken has-[:checked]:border-primary has-[:checked]:bg-highlight {compact
    ? 'gap-2 p-2.5'
    : 'gap-3 p-4'} {disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-hover'} {className}"
>
  <input class="mt-0.5 shrink-0 cursor-[inherit] accent-primary {compact ? 'size-4' : 'size-5'}" {type} {name} {value} {checked} {disabled} onchange={changed} {onclick} />
  <span class="min-w-0 flex-1">
    <span class="flex flex-wrap items-center gap-x-1.5 font-medium break-words hyphens-auto text-content {compact ? 'text-sm' : 'text-base'}">
      {#if icon}<Icon {icon} class="shrink-0 text-muted" />{/if}<span class="min-w-0">{title}</span>{@render titleExtra?.()}
    </span>
    {#if text}<span class="block break-words hyphens-auto text-muted {compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'}">{text}</span>{/if}
  </span>
</label>
