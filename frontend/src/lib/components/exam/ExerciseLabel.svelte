<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { Badge, LinkButton } from "#lib/components/ui";

  interface Props {
    /** Name plus variant/version, since several variants of one exercise can share a name in an exam or MC group. */
    exercise: Pick<ExerciseRecord, "name" | "variantKey" | "version">;
    /** Makes the name a link that opens the exercise in a modal (editor or preview). */
    onOpen?: (() => void) | undefined;
    /** Name on its own line (wrapping, never cut off) with the badges and `children` on a small line below (the exam's exercise list). */
    stacked?: boolean;
    children?: Snippet;
  }

  let { exercise, onOpen = undefined, stacked = false, children }: Props = $props();

  // "_General" is the picker's bucket for exercises without a variant key.
  let variant = $derived(exercise.variantKey && exercise.variantKey !== "_General" ? exercise.variantKey : null);
  let version = $derived(exercise.version && exercise.version > 1 ? exercise.version : null);
</script>

{#snippet badges()}
  {#if variant}
    <Badge size="xs" title={$t("exam.exerciseLabel.variantTitle")}>{variant}</Badge>
  {/if}
  {#if version}
    <Badge size="xs">v{version}</Badge>
  {/if}
{/snippet}

{#if stacked}
  <span class="flex min-w-0 flex-col gap-1">
    {#if onOpen}
      <LinkButton class="whitespace-normal break-words" onClick={onOpen}>{exercise.name || $t("exam.exerciseLabel.untitled")}</LinkButton>
    {:else}
      <span class="min-w-0 break-words">{exercise.name || $t("exam.exerciseLabel.untitled")}</span>
    {/if}
    {#if variant || version || children}
      <span class="flex min-w-0 flex-wrap items-center gap-1">{@render badges()}{@render children?.()}</span>
    {/if}
  </span>
{:else}
<span class="inline-flex min-w-0 flex-wrap items-center gap-1.5">
  {#if onOpen}
    <LinkButton onClick={onOpen}>{exercise.name || $t("exam.exerciseLabel.untitled")}</LinkButton>
  {:else}
    <span class="min-w-0 truncate">{exercise.name || $t("exam.exerciseLabel.untitled")}</span>
  {/if}
  {@render badges()}
</span>
{/if}
