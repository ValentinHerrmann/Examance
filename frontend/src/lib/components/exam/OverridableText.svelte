<script lang="ts">
  import { tick } from "svelte";
  import { faPen, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
  import { Icon, Tooltip, controlClass, controlCompactClass } from "#lib/components/ui";

  /** A value that is generated unless the teacher overrides it (issue #212): shown as text with a pen, edited in place, custom state marked with ↺ back to generated. `line` for the exam title, `hint` for the printed course as a small line under the Class field. */
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
    /** Text of the custom mark ("eigener Titel", "eigene Angabe"). */
    customLabel: string;
    /** Explanation shown on hover. */
    hint?: string;
    variant?: "line" | "hint";
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

  // Slim controls: the global 44px touch rule is lifted (`min-h-0!`) and an invisible `after:` box keeps the tap area large instead.
  const hit = "relative min-h-0! after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']";
  const iconButton = `${hit} inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-xs text-muted hover:bg-surface-inset hover:text-accent`;
</script>

{#if variant === "line"}
  <div class="flex min-w-0 items-start gap-2 {className}">
    <span class="shrink-0 pt-1 text-xs font-medium text-muted">{label}</span>
    {#if editing}
      <input bind:this={input} bind:value={draft} {maxlength} aria-label={label} class="{controlClass} {controlCompactClass} min-w-0 flex-1" onblur={commit} onkeydown={onKey} />
    {:else}
      <!-- One wrapping text block: the title breaks inside the card, the pen follows its last word. -->
      <div class="min-w-0 flex-1 leading-snug">
        <Tooltip text={hint ?? editLabel} wrapperClass="inline">
          <button type="button" class="{hit} group inline cursor-pointer rounded-md border-0 bg-transparent p-0 text-left text-base font-medium break-words text-content hover:text-accent" aria-label="{editLabel}: {text}" onclick={start}>
            {text}<Icon icon={faPen} class="ml-1.5 inline w-3 align-baseline text-xs text-muted group-hover:text-accent" />
          </button>
        </Tooltip>
        {#if custom}
          <span class="ml-1.5 inline-block rounded-full border border-primary bg-highlight px-2 text-xs font-medium text-on-highlight">{customLabel}</span>
          <Tooltip text={resetLabel} wrapperClass="inline-flex align-middle">
            <button type="button" class={iconButton} aria-label={resetLabel} onclick={onReset}><Icon icon={faRotateLeft} /></button>
          </Tooltip>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <div class="flex min-w-0 items-center gap-1.5 text-xs {className}">
    <span class="shrink-0 text-muted">{label}</span>
    {#if editing}
      <input bind:this={input} bind:value={draft} {maxlength} aria-label={label} class="{controlClass} {controlCompactClass} w-full max-w-40 py-0.5!" onblur={commit} onkeydown={onKey} />
    {:else}
      <Tooltip text={custom ? `${hint ?? label} (${customLabel})` : (hint ?? label)} wrapperClass="inline-flex min-w-0">
        <button
          type="button"
          class="{hit} inline-flex min-w-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-xs {custom ? 'font-semibold text-accent' : 'text-content'} hover:text-accent"
          aria-label="{editLabel}: {text}{custom ? ` (${customLabel})` : ''}"
          onclick={start}
        >
          <span class="min-w-0 truncate">{text || "–"}</span><Icon icon={faPen} class="w-2.5 shrink-0 text-[0.6rem] text-muted" />
        </button>
      </Tooltip>
      {#if custom}
        <Tooltip text={resetLabel} wrapperClass="inline-flex shrink-0">
          <button type="button" class={iconButton} aria-label={resetLabel} onclick={onReset}><Icon icon={faRotateLeft} /></button>
        </Tooltip>
      {/if}
    {/if}
  </div>
{/if}
