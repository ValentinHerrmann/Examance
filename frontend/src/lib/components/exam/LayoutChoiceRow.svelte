<script lang="ts" module>
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import type { SketchPart } from "#lib/exam/sheetSketch";

  /** One tile of a row: a radio choice, or with the row's `type="checkbox"` an on/off switch. */
  export interface LayoutChoice {
    value: string;
    title: string;
    /** The one-line explanation shown below the row while this tile is chosen, hovered or focused. */
    text: string;
    icon: IconDefinition;
    checked: boolean;
    /** Why the tile is greyed out; shown as its explanation. */
    disabledReason?: string | null;
    /** The preview element the tile stresses. */
    part?: SketchPart;
    /** Radio: picked; checkbox: switched to *on*. */
    onPick: (on: boolean) => void;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { OptionTile } from "#lib/components/ui";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  /** One dense setting row of the Layout step (issue #272): the label with ⓘ beside title-only tiles on a wide card (above them on a narrow one), and one line below explaining the chosen, hovered or focused tile. */
  interface Props {
    id: string;
    label: string;
    info?: string;
    type?: "radio" | "checkbox";
    choices: LayoutChoice[];
    /** Most tiles per line on a wide card. */
    columns?: 2 | 3 | 4;
    /** The explanation when no tile is chosen or hovered (switch rows, a custom preset). */
    fallback?: string;
    /** A tile's preview element is hovered or focused (*on*), or left. */
    onHighlight?: (part: SketchPart, on: boolean) => void;
    /** A tile was focused or clicked: the preview moves to the element's page. */
    onShow?: (part: SketchPart) => void;
  }

  let { id, label, info = undefined, type = "radio", choices, columns = 3, fallback = "", onHighlight, onShow }: Props = $props();

  // The last word and the ⓘ never break apart.
  let labelHead = $derived(label.slice(0, label.lastIndexOf(" ") + 1));
  let labelTail = $derived(label.slice(label.lastIndexOf(" ") + 1));
  let hovered = $state<string | null>(null);
  let note = $derived.by(() => {
    const shown = choices.find((c) => c.value === hovered) ?? (type === "radio" ? choices.find((c) => c.checked) : undefined);
    if (!shown) return fallback;
    return shown.disabledReason || shown.text;
  });
  // Literal class strings, so Tailwind sees them.
  const COLUMNS = { 2: "@md:grid-cols-2", 3: "@md:grid-cols-3", 4: "@md:grid-cols-2 @3xl:grid-cols-4" } as const;

  function hover(choice: LayoutChoice, on: boolean) {
    if (on) hovered = choice.value;
    else if (hovered === choice.value) hovered = null;
    const part = choice.part;
    if (part) untrack(() => onHighlight?.(part, on));
  }
</script>

<div class="grid min-w-0 grid-cols-1 items-start gap-x-4 gap-y-1.5 @2xl:grid-cols-[10rem_minmax(0,1fr)]">
  <!-- A field label, not a section heading (those are uppercase): the ⓘ stays in the text flow, so a wrapped label keeps it beside its last word. -->
  <span {id} class="text-sm font-medium break-words hyphens-auto text-content @2xl:pt-2">{labelHead}<span class="whitespace-nowrap">{labelTail}{#if info}<InfoTip text={info} class="ml-1 align-middle" />{/if}</span></span>
  <div class="flex min-w-0 flex-col gap-1">
    <div class="grid grid-cols-2 gap-1.5 {COLUMNS[columns]}" role={type === "radio" ? "radiogroup" : "group"} aria-labelledby={id}>
      {#each choices as choice (choice.value)}
        <OptionTile
          dense
          {type}
          name={type === "radio" ? id : undefined}
          value={choice.value}
          checked={choice.checked}
          disabled={!!choice.disabledReason}
          icon={choice.icon}
          title={choice.title}
          describedby="{id}-note"
          onToggle={(on) => choice.onPick(on)}
          onHighlight={(on) => hover(choice, on)}
          onShow={choice.part ? () => onShow?.(choice.part!) : undefined}
        />
      {/each}
    </div>
    <p id="{id}-note" class="m-0 min-h-4 text-xs text-muted">{note}</p>
  </div>
</div>
