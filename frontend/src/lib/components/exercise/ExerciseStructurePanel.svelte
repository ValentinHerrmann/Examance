<script lang="ts">
  import {
    REQUIREMENT_LEVELS,
    appendPart,
    parseExerciseStructure,
    setCompetencies,
    setFixedScore,
    setRequirementLevel,
    type ScoreUnits
  } from "#lib/latex/exerciseStructure";
  import { getRecentValues, recordValue } from "#lib/utils/recentValues";
  import { fmt } from "#lib/utils/format";
  import { t, translate } from "#lib/i18n";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { Badge, Button, Icon, Select, TextInput, controlClass, controlSmClass } from "#lib/components/ui";
  import { faChevronDown, faChevronRight, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";

  interface Props {
    /** The exercise's LaTeX body; every control edits it through `onChange`. */
    latex: string;
    /** MC questions score per correct option: no fixed score and no parts. */
    isMc?: boolean;
    onChange: (latex: string) => void;
    /** Inside `ExerciseStructureModal`: no toggle row, body always shown. */
    embedded?: boolean;
  }

  let { latex, isMc = false, onChange, embedded = false }: Props = $props();

  let structure = $derived(parseExerciseStructure(latex));
  let open = $state(false);
  let competencyDraft = $state("");
  const competencySuggestions = "exercise.competency";
  let recentCompetencies = $state(getRecentValues(competencySuggestions));

  function unitSummary(u: ScoreUnits): string {
    const parts: string[] = [];
    if (u.full) parts.push(translate("exercises.structure.unitFull", { count: u.full }));
    if (u.half) parts.push(translate("exercises.structure.unitHalf", { count: u.half }));
    if (u.quarter) parts.push(translate("exercises.structure.unitQuarter", { count: u.quarter }));
    if (u.mc) parts.push(translate("exercises.structure.unitMc", { count: u.mc }));
    return parts.join(", ");
  }

  /** Empty input = counted score; anything else is a fixed score. */
  function parseScoreInput(raw: string): number | null | undefined {
    const trimmed = raw.trim().replace(",", ".");
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  function changeFixed(raw: string, partIndex: number | null) {
    const value = parseScoreInput(raw);
    if (value === undefined) return;
    onChange(setFixedScore(latex, value, partIndex));
  }

  function changeLevel(level: string, partIndex: number | null) {
    onChange(setRequirementLevel(latex, level || null, partIndex));
  }

  function addCompetency() {
    const value = competencyDraft.trim();
    if (!value) return;
    if (!structure.competencies.includes(value)) {
      onChange(setCompetencies(latex, [...structure.competencies, value]));
    }
    recordValue(competencySuggestions, value);
    recentCompetencies = getRecentValues(competencySuggestions);
    competencyDraft = "";
  }

  function removeCompetency(value: string) {
    onChange(setCompetencies(latex, structure.competencies.filter((c) => c !== value)));
  }

  function addPart() {
    const label = String.fromCodePoint(97 + (structure.parts.length % 26));
    onChange(appendPart(latex, translate("exercises.structure.newPartTitle", { label })));
    open = true;
  }

  const scoreInputClass = `${controlClass} ${controlSmClass} w-20`;
</script>

{#snippet scoreInput(fixed: number | null, counted: number, partIndex: number | null, attrs: { id?: string; title?: string })}
  <input
    {...attrs}
    type="text"
    inputmode="decimal"
    class={scoreInputClass}
    value={fixed === null ? "" : String(fixed)}
    placeholder={$fmt.number(counted)}
    onchange={(e) => changeFixed(e.currentTarget.value, partIndex)}
  />
{/snippet}

{#snippet levelSelect(levels: string[], partIndex: number | null, attrs: { id?: string; "aria-label"?: string })}
  <Select {...attrs} size="sm" value={levels[0] ?? ""} onchange={(e) => changeLevel(e.currentTarget.value, partIndex)}>
    <option value="">{$t("exercises.structure.levelNone")}</option>
    {#each REQUIREMENT_LEVELS as level}
      <option value={level}>{$t("exercises.structure.levelOption", { level })}</option>
    {/each}
  </Select>
{/snippet}

<div class="flex shrink-0 flex-col text-xs {embedded ? '' : 'rounded-md border border-line bg-surface-raised'}">
  {#if !embedded}
  <button
    type="button"
    class="flex w-full cursor-pointer flex-wrap items-center gap-2 border-0 bg-transparent px-3 py-2 text-left"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    <Icon icon={open ? faChevronDown : faChevronRight} class="shrink-0 text-muted" />
    <span class="text-sm font-semibold text-content">{$t("exercises.structure.title")}</span>
    <Badge severity="primary" size="xs">{$t("exercises.structure.scoreBadge", { score: $fmt.number(structure.score) })}</Badge>
    {#if structure.fixed !== null}
      <Badge size="xs">{$t("exercises.structure.fixedBadge")}</Badge>
    {/if}
    {#each structure.levels as level}
      <Badge size="xs">{$t("exercises.structure.levelBadge", { level })}</Badge>
    {/each}
    {#if structure.parts.length > 0}
      <Badge size="xs">{$t("exercises.structure.partsBadge", { count: structure.parts.length })}</Badge>
    {/if}
    {#if structure.score === 0}
      <span class="text-warning-fg">{$t("exercises.structure.noScoreYet")}</span>
    {/if}
  </button>
  {/if}

  {#if open || embedded}
    <div class="flex flex-col gap-3 {embedded ? '' : 'border-t border-line p-3'}">
      <!-- Score: counted from the BE macros unless fixed. -->
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-content">{$t("exercises.structure.scoreLabel")}</span>
          <InfoTip text={$t("help.tips.exerciseScore")} topic="exercises" />
          {#if !isMc}
            <label class="ml-auto flex items-center gap-1.5 text-muted" for="structure-fixed">
              {$t("exercises.structure.fixedLabel")}
              {@render scoreInput(structure.fixed, structure.counted, null, { id: "structure-fixed" })}
            </label>
          {/if}
        </div>
        <p class="m-0 text-muted">
          {#if structure.fixed !== null}
            {$t("exercises.structure.fixedHint", { counted: $fmt.number(structure.counted) })}
          {:else if structure.counted > 0}
            {$t("exercises.structure.countedHint", { units: unitSummary(structure.units) })}
          {:else if isMc}
            {$t("exercises.structure.emptyHintMc")}
          {:else}
            {$t("exercises.structure.emptyHint")}
          {/if}
        </p>
      </div>

      <!-- Requirement level and competencies of the whole exercise. -->
      <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
        <label class="flex items-center gap-1.5 font-semibold text-content" for="structure-level">
          {$t("exercises.structure.levelLabel")}
          <InfoTip text={$t("help.tips.requirementLevel")} topic="exercises" />
          {@render levelSelect(structure.levels, null, { id: "structure-level" })}
        </label>

        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <label class="font-semibold text-content" for="structure-competency">{$t("exercises.structure.competenciesLabel")}</label>
          {#if structure.competencies.length > 0}
            <div class="flex flex-wrap gap-1">
              {#each structure.competencies as competency}
                <span class="inline-flex items-center gap-1 rounded-md bg-surface-inset px-1.5 py-0.5 text-content">
                  {competency}
                  <button
                    type="button"
                    class="cursor-pointer border-0 bg-transparent p-0 text-muted hover:text-danger-fg"
                    onclick={() => removeCompetency(competency)}
                    title={$t("exercises.structure.removeCompetency", { competency })}
                    aria-label={$t("exercises.structure.removeCompetency", { competency })}
                  ><Icon icon={faXmark} /></button>
                </span>
              {/each}
            </div>
          {/if}
          <div class="flex min-w-0 items-center gap-1.5">
            <TextInput
              id="structure-competency"
              size="sm"
              class="min-w-0 flex-1"
              list="structure-competency-suggestions"
              maxlength={120}
              bind:value={competencyDraft}
              placeholder={$t("exercises.structure.competencyPlaceholder")}
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCompetency();
                }
              }}
            />
            <datalist id="structure-competency-suggestions">
              {#each recentCompetencies as suggestion}
                <option value={suggestion}></option>
              {/each}
            </datalist>
            <Button size="sm" icon={faPlus} onClick={addCompetency} disabled={!competencyDraft.trim()}>
              {$t("exercises.structure.addCompetency")}
            </Button>
          </div>
        </div>
      </div>

      {#if !isMc}
        <!-- Part exercises (a, b, c) with their own score box. -->
        <div class="flex flex-col gap-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 font-semibold text-content">
              {$t("exercises.structure.partsLabel")}
              <InfoTip text={$t("help.tips.partExercises")} topic="exercises" />
            </span>
            <Button size="sm" icon={faPlus} onClick={addPart}>{$t("exercises.structure.addPart")}</Button>
          </div>
          {#if structure.parts.length === 0}
            <p class="m-0 text-muted">{$t("exercises.structure.noParts")}</p>
          {:else}
            {#each structure.parts as part, index}
              <div class="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-sunken p-2">
                <span class="min-w-0 flex-1 truncate text-content">
                  <strong>{part.label})</strong> {part.title}
                </span>
                <label class="flex items-center gap-1 text-muted">
                  <span class="sr-only">{$t("exercises.structure.partScoreLabel", { label: part.label })}</span>
                  {@render scoreInput(part.fixed, part.counted, index, { title: $t("exercises.structure.partScoreTitle") })}
                  {$t("exercises.structure.pointsUnit")}
                </label>
                {@render levelSelect(part.levels, index, { "aria-label": $t("exercises.structure.partLevelLabel", { label: part.label }) })}
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
