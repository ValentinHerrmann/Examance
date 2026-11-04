<script lang="ts" module>
  import type { ExerciseRecord } from "#lib/db/schema";

  type Labelled = Pick<ExerciseRecord, "name" | "variantKey" | "version">;

  /** The variant to show; "_General" is the picker's bucket for exercises without one. */
  export function variantOf(exercise: Labelled): string | null {
    return exercise.variantKey && exercise.variantKey !== "_General" ? exercise.variantKey : null;
  }

  export function versionOf(exercise: Labelled): number | null {
    return exercise.version && exercise.version > 1 ? exercise.version : null;
  }
</script>

<script lang="ts">
  import { t } from "#lib/i18n";
  import { Badge, LinkButton } from "#lib/components/ui";

  interface Props {
    /** Name plus variant/version, since several variants of one exercise can share a name in an exam or MC group. */
    exercise: Labelled;
    /** Makes the name a link that opens the exercise in a modal (editor or preview). */
    onOpen?: (() => void) | undefined;
  }

  let { exercise, onOpen = undefined }: Props = $props();

  let variant = $derived(variantOf(exercise));
  let version = $derived(versionOf(exercise));
</script>

<span class="inline-flex min-w-0 flex-wrap items-center gap-1.5">
  {#if onOpen}
    <LinkButton onClick={onOpen}>{exercise.name || $t("exam.exerciseLabel.untitled")}</LinkButton>
  {:else}
    <span class="min-w-0 truncate">{exercise.name || $t("exam.exerciseLabel.untitled")}</span>
  {/if}
  {#if variant}
    <Badge size="xs" title={$t("exam.exerciseLabel.variantTitle")}>{variant}</Badge>
  {/if}
  {#if version}
    <Badge size="xs">v{version}</Badge>
  {/if}
</span>
