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
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";

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
    /** The hovered or focused tile's preview element, or null when it leaves. */
    onHighlight?: (part: SketchPart | null) => void;
  }

  let { id, label, info = undefined, type = "radio", choices, columns = 3, fallback = "", onHighlight }: Props = $props();

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
    untrack(() => onHighlight?.(on ? (choice.part ?? null) : null));
  }
</script>

<div class="grid min-w-0 grid-cols-1 items-start gap-x-4 gap-y-1.5 @2xl:grid-cols-[10rem_minmax(0,1fr)]">
  <SectionHeading {id} {label} {info} class="@2xl:pt-2.5" />
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
        />
      {/each}
    </div>
    <p id="{id}-note" class="m-0 min-h-4 text-xs text-muted">{note}</p>
  </div>
</div>
