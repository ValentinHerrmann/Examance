<script lang="ts">
  import { faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Icon } from "#lib/components/ui";
  import type { PackageNote } from "#lib/latex/packages";
  import { isWarning, noteText } from "#lib/latex/packageMessages";

  /** What a package merge changed or left out (issue #108); warnings first catch the eye. */
  interface Props {
    notes: PackageNote[];
    size?: "xs" | "sm";
  }

  let { notes, size = "sm" }: Props = $props();
</script>

{#if notes.length}
  <ul class="m-0 flex list-none flex-col gap-1 p-0 {size === 'xs' ? 'text-xs' : 'text-sm'}">
    {#each notes as note, index (index)}
      <li class="flex items-start gap-2 {isWarning(note) ? 'text-warning-fg' : 'text-muted'}">
        <Icon icon={isWarning(note) ? faTriangleExclamation : faCircleInfo} class="mt-0.5 shrink-0" />
        <span class="min-w-0">{noteText($t, note)}</span>
      </li>
    {/each}
  </ul>
{/if}
