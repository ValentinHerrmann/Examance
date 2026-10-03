<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Badge } from "$lib/components/ui";

  interface Props {
    /** Name plus variant/version, since several variants of one exercise can share a name in an exam or MC group. */
    exercise: Pick<ExerciseRecord, "name" | "variantKey" | "version">;
  }

  let { exercise }: Props = $props();

  // "_General" is the picker's bucket for exercises without a variant key.
  let variant = $derived(exercise.variantKey && exercise.variantKey !== "_General" ? exercise.variantKey : null);
  let version = $derived(exercise.version && exercise.version > 1 ? exercise.version : null);
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
