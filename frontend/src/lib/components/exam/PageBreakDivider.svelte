<script lang="ts">
  import { t } from "#lib/i18n";
  import { faFileLines, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";

  /** Sits between two exam items and belongs to the item below it, so it follows that item when moved. */
  interface Props {
    active: boolean;
    onToggle: () => void;
  }

  let { active, onToggle }: Props = $props();
</script>

<div class="col-span-3 flex items-center justify-center gap-2 sm:col-span-4">
  {#if active}
    <div class="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
      <span class="flex-1 border-t border-dashed border-line-strong"></span>
      <span class="shrink-0">{$t("exam.pageBreak.label")}</span>
      <span class="flex-1 border-t border-dashed border-line-strong"></span>
    </div>
    <Button
      size="sm" variant="text" severity="secondary" iconOnly icon={faXmark}
      class="pointer-coarse:min-h-11"
      ariaLabel={$t("exam.pageBreak.remove")}
      onClick={onToggle}
    />
  {:else}
    <Button
      size="sm" variant="text" severity="secondary" icon={faFileLines}
      class="text-xs pointer-coarse:min-h-11"
      onClick={onToggle}
    >{$t("exam.pageBreak.insert")}</Button>
  {/if}
</div>
