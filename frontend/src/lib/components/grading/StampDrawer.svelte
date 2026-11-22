<script lang="ts">
  import type { ToolType } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, Popover } from "#lib/components/ui";
  import StampGlyph from "./StampGlyph.svelte";
  import type { StampDef, StampGroup } from "./toolbarLayout";

  /** One toolbox button standing for several stamps (issue #330): shows the chosen one of them and opens a flyout with all. */
  interface Props {
    id: "plus" | "minus" | "other" | "scores" | "stamps";
    stamps: StampDef[];
    placement: "right-start" | "left-start" | "bottom-start";
    buttonClass: string;
    isSelected: (stamp: StampDef) => boolean;
    onPick: (tool: ToolType) => void;
  }

  let { id, stamps, placement, buttonClass, isSelected, onPick }: Props = $props();
  let open = $state(false);

  let chosen = $derived(stamps.find(isSelected));
  // One row per stamp group, so "+", "−" and "other" stay apart in the larger drawers.
  let rows = $derived((["plus", "minus", "other"] as StampGroup[]).map((g) => stamps.filter((s) => s.group === g)).filter((r) => r.length > 0));

  function pick(tool: ToolType) {
    open = false;
    onPick(tool);
  }
</script>

<Popover bind:open {placement} panelClass="p-1">
  {#snippet trigger()}
    <Button
      size="sm"
      variant="text"
      severity="secondary"
      class="{buttonClass} relative"
      pressed={!!chosen}
      aria-haspopup="true"
      aria-expanded={open}
      onClick={() => (open = !open)}
      title={$t(`grading.toolbar.drawerTitle.${id}`)}
    >
      <StampGlyph stamp={chosen ?? stamps[0]} label={false} />
      <span class="text-xs font-semibold">{chosen ? $t(`grading.toolbar.${chosen.key}`) : $t(`grading.toolbar.drawer.${id}`)}</span>
      <!-- Corner notch: this button opens more. -->
      <Icon icon={faCaretDown} class="absolute right-0.5 bottom-0 -rotate-45 text-[10px] opacity-60" />
    </Button>
  {/snippet}
  <div class="flex flex-col gap-1" role="group" aria-label={$t(`grading.toolbar.drawerTitle.${id}`)}>
    {#each rows as row, i (i)}
      <div class="flex gap-1">
        {#each row as stamp (stamp.tool)}
          <Button size="sm" variant="text" severity="secondary" class={buttonClass} pressed={isSelected(stamp)} onClick={() => pick(stamp.tool)} title={$t(`grading.toolbar.${stamp.key}Title`)}>
            <StampGlyph {stamp} />
          </Button>
        {/each}
      </div>
    {/each}
  </div>
</Popover>
