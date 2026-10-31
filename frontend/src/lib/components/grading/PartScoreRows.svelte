<script lang="ts">
  // Part score rows of one exercise (Teilaufgaben, issue #187): typing a part sets the exercise score to the sum of its parts; clicking a row makes the part the stamp target.
  import type { ExerciseRecord } from "#lib/db/schema";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { exerciseParts, partOverrideKey } from "#lib/grading/partScores";
  import { t } from "#lib/i18n";
  import { faBullseye, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, controlClass, controlSmClass } from "#lib/components/ui";

  interface Props {
    exercise: ExerciseRecord;
  }

  let { exercise }: Props = $props();

  let parts = $derived(exerciseParts(exercise));

  function isTarget(label: string): boolean {
    return $gradingStore.activeExerciseId === exercise.id && $gradingStore.activePartLabel === label;
  }

  function handleInput(label: string, max: number, e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    gradingStore.setManualOverrideFlag(partOverrideKey(exercise.id, label), true);
    const parsed = parseFloat(raw);
    gradingStore.setPartInput(exercise.id, label, raw === "" || isNaN(parsed) ? null : Math.max(0, Math.min(max, parsed)));
  }

  function reset(label: string, e: MouseEvent) {
    e.stopPropagation();
    gradingStore.setPartInput(exercise.id, label, null);
    gradingStore.setManualOverrideFlag(partOverrideKey(exercise.id, label), false);
  }
</script>

{#if parts.length > 0}
  <div class="ml-4 flex flex-col gap-1">
    {#each parts as part (part.label)}
      <div
        class="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs transition-colors pointer-coarse:min-h-11
          {isTarget(part.label) ? 'border-primary bg-highlight' : 'border-line bg-surface-raised hover:bg-surface-inset'}"
        onclick={() => gradingStore.setActivePart(exercise.id, part.label)}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") gradingStore.setActivePart(exercise.id, part.label); }}
      >
        <span class="flex items-center gap-1 font-semibold text-content">
          {$t("grading.scoreEntry.partRowLabel", { label: part.label })}
          {#if isTarget(part.label)}
            <Icon icon={faBullseye} class="text-accent" label={$t("grading.scoreEntry.stampTarget")} />
          {/if}
          {#if $gradingStore.manualOverride[partOverrideKey(exercise.id, part.label)]}
            <span class="size-2 shrink-0 rounded-full bg-warning" title={$t("grading.scoreEntry.manualEdit")}></span>
          {/if}
        </span>
        <span class="flex items-center gap-1">
          <input
            type="number"
            step="0.25"
            min="0"
            max={part.max}
            placeholder="–"
            aria-label={$t("grading.scoreEntry.partRowLabel", { label: part.label })}
            value={$gradingStore.partInputs[exercise.id]?.[part.label] ?? ""}
            onclick={(e) => e.stopPropagation()}
            oninput={(e) => handleInput(part.label, part.max, e)}
            class="{controlClass} {controlSmClass} w-14 text-right pointer-coarse:min-h-11 pointer-coarse:text-base"
          />
          <span class="text-muted">/ {part.max}</span>
          <Button
            size="sm"
            variant="text"
            severity="secondary"
            iconOnly
            icon={faXmark}
            title={$t("grading.scoreEntry.resetTitle")}
            ariaLabel={$t("grading.scoreEntry.resetTitle")}
            onClick={(e) => reset(part.label, e)}
          />
        </span>
      </div>
    {/each}
  </div>
{/if}
