<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Badge } from "$lib/components/ui";

  /**
   * An exercise's name plus the variant (and non-initial version) that tells
   * same-named variants apart — several variants of one exercise can sit in
   * the same exam or MC group, and the bare name is identical for all of them.
   */
  export let exercise: Pick<ExerciseRecord, "name" | "variantKey" | "version">;

  // "_General" is the picker's bucket for exercises without a variant key.
  $: variant = exercise.variantKey && exercise.variantKey !== "_General" ? exercise.variantKey : null;
  $: version = exercise.version && exercise.version > 1 ? exercise.version : null;
</script>

<span class="inline-flex min-w-0 flex-wrap items-center gap-1.5">
  <span class="min-w-0 truncate">{exercise.name || $t("exam.exerciseLabel.untitled")}</span>
  {#if variant}
    <Badge size="xs" title={$t("exam.exerciseLabel.variantTitle")}>{variant}</Badge>
  {/if}
  {#if version}
    <Badge size="xs">v{version}</Badge>
  {/if}
</span>
