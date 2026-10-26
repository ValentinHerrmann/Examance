<script lang="ts">
  import { t } from "#lib/i18n";
  import { MC_MAX_COLUMNS, MC_MAX_OPTIONS, MC_MIN_OPTIONS, type McOption } from "#lib/latex/mcOptions";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { Alert, Button, Checkbox, Select, controlClass, controlSmClass } from "#lib/components/ui";
  import { faCode, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";

  /** Question, options and layout of an MC exercise. The composed LaTeX is shown on demand (`onShowLatex`), not here. */
  interface Props {
    questionText: string;
    options: McOption[];
    /** "auto" or a column count, as a <select> value. */
    columns: string;
    penalty: number;
    malformed: boolean;
    /** Question text or columns changed. */
    onChange: () => void;
    onOptionsChange: (options: McOption[]) => void;
    onShowLatex: () => void;
  }

  let {
    questionText = $bindable(),
    options,
    columns = $bindable(),
    penalty = $bindable(),
    malformed,
    onChange,
    onOptionsChange,
    onShowLatex
  }: Props = $props();

  const columnChoices = Array.from({ length: MC_MAX_COLUMNS }, (_, i) => String(i + 1));
  const update = (index: number, patch: Partial<McOption>) =>
    onOptionsChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
</script>

<div class="flex flex-col gap-3 text-xs">
  {#if malformed}
    <Alert severity="warning">
      <p class="m-0 mb-2">{$t("exercises.editor.mcBlockMalformed")}</p>
      <Button size="sm" variant="outlined" icon={faCode} onClick={onShowLatex}>{$t("exercises.editor.showLatexButton")}</Button>
    </Alert>
  {/if}

  <div class="flex flex-col gap-1">
    <span class="font-semibold text-content">{$t("exercises.editor.mcQuestionTextLabel")}</span>
    <LatexEditor bind:value={questionText} rows={4} showQuickInsert {onChange} />
  </div>

  <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
    <label class="flex flex-col gap-1 font-semibold text-content">
      <span class="flex items-center gap-1.5">
        {$t("exercises.editor.mcPenaltyLabel")}
        <InfoTip text={$t("help.tips.mcPenalty")} topic="exercises" />
      </span>
      <input type="number" step="0.25" min="0" bind:value={penalty} class="{controlClass} {controlSmClass} w-24" />
    </label>
    <label class="flex flex-col gap-1 font-semibold text-content">
      {$t("exercises.editor.mcColumnsLabel")}
      <Select size="sm" class="w-auto" bind:value={columns} onchange={onChange}>
        <option value="auto">{$t("exercises.editor.mcColumnsAuto", { max: MC_MAX_COLUMNS })}</option>
        {#each columnChoices as choice (choice)}
          <option value={choice}>{choice}</option>
        {/each}
      </Select>
    </label>
  </div>

  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between font-semibold text-content">
      <span>{$t("exercises.editor.mcOptionsLabel", { count: options.length })}</span>
      <Button
        size="sm"
        icon={faPlus}
        onClick={() => onOptionsChange([...options, { text: "", correct: false }])}
        disabled={options.length >= MC_MAX_OPTIONS}
      >{$t("exercises.editor.mcAddOptionButton")}</Button>
    </div>

    {#each options as option, index (index)}
      <div class="flex items-center gap-2">
        <Checkbox
          checked={option.correct}
          onChange={() => update(index, { correct: !option.correct })}
          title={$t("exercises.editor.mcOptionCorrectTitle")}
          aria-label={$t("exercises.editor.mcOptionCorrectTitle")}
        />
        <input
          type="text"
          value={option.text}
          oninput={(e) => update(index, { text: e.currentTarget.value })}
          placeholder={$t("exercises.editor.mcOptionPlaceholder", { number: index + 1 })}
          class="{controlClass} {controlSmClass} flex-1"
        />
        <Button
          variant="text"
          severity="secondary"
          size="sm"
          iconOnly
          icon={faXmark}
          onClick={() => onOptionsChange(options.filter((_, i) => i !== index))}
          disabled={options.length <= MC_MIN_OPTIONS}
          title={$t("exercises.editor.mcOptionRemoveTitle")}
          ariaLabel={$t("exercises.editor.mcOptionRemoveTitle")}
        />
      </div>
    {/each}
  </div>
</div>
