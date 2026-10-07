<script lang="ts">
  import { computeSideBySideDiff, type DiffLine } from "#lib/latex/diff";

  /** Read-only, line-aligned LaTeX diff in two columns (resync, proposals). */
  interface Props {
    left: string;
    right: string;
    leftLabel: string;
    rightLabel: string;
  }

  let { left, right, leftLabel, rightLabel }: Props = $props();

  let diff = $derived(computeSideBySideDiff(left, right));

  const lineClass: Record<DiffLine["type"], string> = {
    added: "bg-success/15",
    removed: "bg-danger/15",
    modified: "bg-warning/15",
    unchanged: "",
    empty: "bg-surface-sunken",
  };
</script>

<div class="overflow-x-auto rounded-md border border-line">
  <div class="grid min-w-[36rem] grid-cols-2 font-mono text-xs">
    <div class="border-b border-r border-line bg-surface-sunken px-2 py-1 font-sans font-semibold text-muted">{leftLabel}</div>
    <div class="border-b border-line bg-surface-sunken px-2 py-1 font-sans font-semibold text-muted">{rightLabel}</div>
    {#each diff.leftLines as leftLine, row (row)}
      {@const rightLine = diff.rightLines[row]}
      <div class="min-w-0 whitespace-pre-wrap break-words border-r border-line px-2 py-0.5 text-content {lineClass[leftLine.type]}">{leftLine.text ?? ""}</div>
      <div class="min-w-0 whitespace-pre-wrap break-words px-2 py-0.5 text-content {rightLine ? lineClass[rightLine.type] : ''}">{rightLine?.text ?? ""}</div>
    {/each}
  </div>
</div>
