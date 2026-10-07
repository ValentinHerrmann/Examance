<script lang="ts">
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import LatexSideBySideDiff from "./LatexSideBySideDiff.svelte";
  import { t } from "#lib/i18n";
  import { Button } from "#lib/components/ui";
  import { faPenToSquare, faRotateLeft } from "@fortawesome/free-solid-svg-icons";

  /**
   * Merge of two LaTeX texts: shows `mine` against the result and lets the user edit the result in place.
   * `value` starts as `theirs` (the incoming text); "reset" restores either side.
   */
  interface Props {
    mine: string;
    theirs: string;
    value?: string;
    mineLabel: string;
    theirsLabel: string;
  }

  let { mine, theirs, value = $bindable(""), mineLabel, theirsLabel }: Props = $props();

  let editing = $state(false);
  let edited = $derived(value !== theirs);
</script>

<div class="flex flex-col gap-2">
  <LatexSideBySideDiff
    left={mine}
    right={value}
    leftLabel={mineLabel}
    rightLabel={edited ? $t("exercises.merge.result") : theirsLabel}
  />
  <div class="flex flex-wrap items-center gap-2">
    <Button variant="outlined" severity="secondary" size="sm" icon={faPenToSquare} pressed={editing} onClick={() => (editing = !editing)}>
      {editing ? $t("exercises.merge.hideEditor") : $t("exercises.merge.editResult")}
    </Button>
    {#if edited}
      <Button variant="text" severity="secondary" size="sm" icon={faRotateLeft} onClick={() => (value = theirs)}>
        {$t("exercises.merge.resetTheirs", { label: theirsLabel })}
      </Button>
    {/if}
    {#if mine && value !== mine}
      <Button variant="text" severity="secondary" size="sm" icon={faRotateLeft} onClick={() => (value = mine)}>
        {$t("exercises.merge.resetMine", { label: mineLabel })}
      </Button>
    {/if}
  </div>
  {#if editing}
    <LatexEditor bind:value rows={10} />
  {/if}
</div>
