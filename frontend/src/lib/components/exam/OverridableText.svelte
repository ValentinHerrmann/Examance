<script lang="ts">
  import { tick } from "svelte";
  import { faPen, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
  import { Icon, Tooltip, controlClass, controlCompactClass } from "#lib/components/ui";

  /** A value that is generated unless the teacher overrides it (issue #212): shown as text with a pen, edited in place, custom state marked with ↺ back to generated. `line` for the exam title, `chip` for the printed course inside the Class field. */
  interface Props {
    /** The value shown: the override when custom, else the generated one. */
    text: string;
    custom: boolean;
    onChange: (value: string) => void;
    onReset: () => void;
    /** Accessible name of the value (also the input's label). */
    label: string;
    editLabel: string;
    resetLabel: string;
    /** Text of the custom mark ("eigener Titel"); `chip` shows it as tooltip only. */
    customLabel: string;
    /** Explanation shown on hover. */
    hint?: string;
    variant?: "line" | "chip";
    maxlength?: number;
    class?: string;
  }

  let { text, custom, onChange, onReset, label, editLabel, resetLabel, customLabel, hint = undefined, variant = "line", maxlength = 500, class: className = "" }: Props = $props();

  let editing = $state(false);
  let draft = $state("");
  let input = $state<HTMLInputElement | null>(null);

  async function start() {
    draft = text;
    editing = true;
    await tick();
    input?.select();
  }

  function commit() {
    if (!editing) return;
    editing = false;
    const v = draft.trim();
    if (v && v !== text) onChange(v);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      editing = false;
    }
  }

  const iconButton = "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-xs text-muted hover:bg-surface-inset hover:text-accent pointer-coarse:size-9";
</script>

{#if variant === "line"}
  <div class="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 {className}">
    <span class="shrink-0 text-xs font-medium text-muted">{label}</span>
    {#if editing}
      <input bind:this={input} bind:value={draft} {maxlength} aria-label={label} class="{controlClass} {controlCompactClass} flex-1" onblur={commit} onkeydown={onKey} />
    {:else}
      <Tooltip text={hint ?? editLabel} wrapperClass="min-w-0">
        <button type="button" class="group flex min-w-0 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1 py-0.5 text-left text-base font-medium text-content hover:bg-surface-inset" aria-label="{editLabel}: {text}" onclick={start}>
          <span class="min-w-0 truncate">{text}</span>
          <Icon icon={faPen} class="w-3 shrink-0 text-xs text-muted group-hover:text-accent" />
        </button>
      </Tooltip>
      {#if custom}
        <span class="shrink-0 rounded-full border border-primary bg-highlight px-2 py-0.5 text-xs font-medium text-on-highlight">{customLabel}</span>
        <Tooltip text={resetLabel}>
          <button type="button" class={iconButton} aria-label={resetLabel} onclick={onReset}><Icon icon={faRotateLeft} /></button>
        </Tooltip>
      {/if}
    {/if}
  </div>
{:else}
  <div class="flex items-center gap-0.5 {className}">
    {#if editing}
      <input bind:this={input} bind:value={draft} {maxlength} aria-label={label} class="{controlClass} {controlCompactClass} w-28 py-0.5" onblur={commit} onkeydown={onKey} />
    {:else}
      <Tooltip text={custom ? `${hint ?? label} (${customLabel})` : (hint ?? label)}>
        <button
          type="button"
          class="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold {custom
            ? 'border-primary bg-highlight text-on-highlight'
            : 'border-transparent bg-surface-inset text-accent'}"
          aria-label="{editLabel}: {text}"
          onclick={start}
        >
          {text || "–"}<Icon icon={faPen} class="w-2.5 text-[0.6rem] opacity-70" />
        </button>
      </Tooltip>
      {#if custom}
        <Tooltip text={resetLabel}>
          <button type="button" class={iconButton} aria-label={resetLabel} onclick={onReset}><Icon icon={faRotateLeft} /></button>
        </Tooltip>
      {/if}
    {/if}
  </div>
{/if}
