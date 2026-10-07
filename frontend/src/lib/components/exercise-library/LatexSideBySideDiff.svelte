<script lang="ts">
  import { computeSideBySideDiff, type DiffLine } from "#lib/latex/diff";
  import { t } from "#lib/i18n";

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

  // Not colour only: a gutter sign plus screen-reader text marks each changed line.
  const marker = {
    added: { sign: "+", key: "exercises.merge.lineAdded" },
    removed: { sign: "−", key: "exercises.merge.lineRemoved" },
    modified: { sign: "~", key: "exercises.merge.lineChanged" },
  } as const;
</script>

{#snippet gutter(line: DiffLine | undefined)}
  {@const m = line && line.type in marker ? marker[line.type as keyof typeof marker] : null}
  <span class="w-5 shrink-0 select-none py-0.5 text-center text-muted" aria-hidden="true">{m?.sign ?? ""}</span>
  {#if m}<span class="sr-only">{$t(m.key)}: </span>{/if}
{/snippet}

<div class="overflow-x-auto rounded-md border border-line">
  <div class="grid min-w-[36rem] grid-cols-2 font-mono text-xs">
    <div class="border-b border-r border-line bg-surface-sunken px-2 py-1 font-sans font-semibold text-muted">{leftLabel}</div>
    <div class="border-b border-line bg-surface-sunken px-2 py-1 font-sans font-semibold text-muted">{rightLabel}</div>
    {#each diff.leftLines as leftLine, row (row)}
      {@const rightLine = diff.rightLines[row]}
      <div class="flex min-w-0 border-r border-line text-content {lineClass[leftLine.type]}">{@render gutter(leftLine)}<span class="min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 pr-2">{leftLine.text ?? ""}</span></div>
      <div class="flex min-w-0 text-content {rightLine ? lineClass[rightLine.type] : ''}">{@render gutter(rightLine)}<span class="min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 pr-2">{rightLine?.text ?? ""}</span></div>
    {/each}
  </div>
</div>
