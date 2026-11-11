<script lang="ts">
  import type { Snippet } from "svelte";
  import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import Button from "./Button.svelte";
  import Checkbox from "./Checkbox.svelte";
  import Icon from "./Icon.svelte";

  /** The one list-selection toolbar (Students table, exam list, exercise library): always shown, actions that cannot run are greyed out; `reason` says why once something is selected (before that, `hint` is the only line). */
  interface Props {
    count: number;
    /** Shown instead of the count while nothing is selected. */
    hint: string;
    /** Count line, e.g. "3 selected". */
    countText: string;
    /** Number of selectable rows; with `onSelectAll` the toolbar gets its own select-all box. */
    total?: number;
    onSelectAll?: (on: boolean) => void;
    selectAllLabel?: string;
    onClear: () => void;
    reason?: string;
    actions: Snippet;
  }

  let { count, hint, countText, total = 0, onSelectAll, selectAllLabel = "", onClear, reason = "", actions }: Props = $props();
</script>

<div class="flex flex-col gap-1 rounded-md border border-line p-2 text-sm">
  <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label={hint}>
    {#if onSelectAll}
      <Checkbox
        checked={total > 0 && count === total}
        indeterminate={count > 0 && count < total}
        disabled={total === 0}
        onChange={onSelectAll}
        aria-label={selectAllLabel}
      />
    {/if}
    <span class="mr-2">{count ? countText : hint}</span>
    {@render actions()}
    <Button size="sm" variant="text" severity="secondary" disabled={!count} onClick={onClear}>{$t("sharing.share.selectNone")}</Button>
  </div>
  {#if reason && count}
    <p class="m-0 flex items-start gap-1.5 text-muted">
      <Icon icon={faCircleInfo} class="mt-0.5 shrink-0" />{reason}
    </p>
  {/if}
</div>
