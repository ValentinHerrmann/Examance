<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import { faBullseye, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, controlClass, controlSmClass } from "#lib/components/ui";

  interface Props {
    exercises: ExerciseRecord[];
  }

  let { exercises }: Props = $props();

  function selectExercise(id: string) {
    gradingStore.setActiveExerciseId(id);
  }

  function handleScoreInput(ex: ExerciseRecord, e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const raw = target.value.trim();
    gradingStore.setManualOverrideFlag(ex.id, true);
    if (raw === '') {
      gradingStore.setScoreInput(ex.id, null);
    } else {
      const parsed = parseFloat(raw);
      gradingStore.setScoreInput(ex.id, isNaN(parsed) ? null : Math.max(0, Math.min(ex.maxPoints, parsed)));
    }
  }

  function resetScore(ex: ExerciseRecord, e: MouseEvent) {
    e.stopPropagation();
    gradingStore.setScoreInput(ex.id, null);
    gradingStore.setManualOverrideFlag(ex.id, false);
  }

  const itemBase =
    "flex cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-2 py-1.5 transition-colors hover:border-line-strong hover:bg-surface-inset pointer-coarse:min-h-11";
  const itemActive =
    "flex cursor-pointer items-center justify-between gap-2 rounded-md border border-primary bg-highlight px-2 py-1.5 shadow-sm transition-colors pointer-coarse:min-h-11";
</script>

<div class="shrink-0 border-b border-line bg-surface-raised px-3 py-2.5">
  <h3 class="m-0 text-sm font-semibold text-content">{$t("grading.scoreEntry.title", { count: exercises.length })}</h3>
  <span class="text-xs text-muted">{$t("grading.scoreEntry.hint")}</span>
</div>

<div class="flex flex-1 min-h-0 flex-col gap-1.5 overflow-y-auto p-2">
  {#each exercises as ex}
    <div
      class={ex.id === $gradingStore.activeExerciseId ? itemActive : itemBase}
      onclick={() => selectExercise(ex.id)}
      role="button"
      tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectExercise(ex.id); }}
    >
      <div class="flex items-center gap-1">
        <span class="text-xs font-bold text-content">Q{ex.orderIndex}{#if ex.subIndex}&nbsp;{String.fromCharCode(96 + ex.subIndex)}){/if}</span>
        {#if ex.id === $gradingStore.activeExerciseId}
          <Icon icon={faBullseye} class="text-xs text-accent" label={$t("grading.scoreEntry.stampTarget")} />
        {/if}
      </div>

      <div class="flex items-center gap-1">
        <input
          id={`score-${ex.id}`}
          type="number"
          step="0.25"
          min="0"
          max={ex.maxPoints}
          placeholder="–"
          value={$gradingStore.scoreInputs[ex.id] ?? ''}
          oninput={(e) => handleScoreInput(ex, e)}
          class="{controlClass} {controlSmClass} w-16 text-right font-bold pointer-coarse:min-h-11 pointer-coarse:text-base"
        />
        <span class="text-xs text-muted">/ {ex.maxPoints}</span>
        <Button
          size="sm"
          variant="text"
          severity="secondary"
          iconOnly
          icon={faXmark}
          title={$t("grading.scoreEntry.resetTitle")}
          ariaLabel={$t("grading.scoreEntry.resetTitle")}
          onClick={(e) => resetScore(ex, e)}
        />
      </div>

      {#if $gradingStore.manualOverride[ex.id]}
        <span class="size-2 shrink-0 rounded-full bg-warning" title={$t("grading.scoreEntry.manualEdit")}></span>
      {/if}
    </div>
  {/each}
</div>
