<script lang="ts">
  import { untrack } from "svelte";
  import { t, translate } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { Alert, Button, Card, Checkbox, Field, controlClass } from "#lib/components/ui";
  import {
    DEFAULT_OMR_PARAMS,
    OMR_PARAM_ALGORITHM,
    OMR_PARAM_SPECS,
    OMR_ALGORITHMS,
    type OmrAlgorithm,
    type OmrDetectionParams,
    type OmrNumericParamKey,
    type OmrParamKey,
    type OmrParamSpec,
    type OmrParamsError,
    type OmrSettingsProfile,
  } from "#lib/grading/omrSettings";

  type NumberSpec = Extract<OmrParamSpec, { kind: "number" }>;

  interface Props {
    /** The settings the next detection run will use. */
    profile: OmrSettingsProfile;
    /** Persists the params; returns validation errors (nothing saved unless empty). */
    onSave: (params: OmrDetectionParams) => OmrParamsError[];
    onReset: () => void;
  }

  let { profile, onSave, onReset }: Props = $props();

  // Number inputs bind as number, or null while a field is empty.
  const initial = untrack(() => profile);
  let draft: Record<OmrNumericParamKey, number | null> = $state(toDraft(initial.params));
  let draftShapeAnalysis = $state(initial.params.shapeAnalysis);
  let draftAlgorithm: OmrAlgorithm = $state(initial.params.algorithm);
  let errors: OmrParamsError[] = $state.raw([]);
  let statusMsg = $state("");
  let lastRevision = initial.revision;

  function numberSpecs(group: OmrParamSpec["group"]): NumberSpec[] {
    return OMR_PARAM_SPECS.filter((s): s is NumberSpec => s.kind === "number" && s.group === group);
  }

  function toDraft(p: OmrDetectionParams): Record<OmrNumericParamKey, number | null> {
    return Object.fromEntries(numberSpecs("basic").concat(numberSpecs("advanced"), numberSpecs("fixed")).map((s) => [s.key, p[s.key]])) as Record<OmrNumericParamKey, number | null>;
  }

  const basicSpecs = numberSpecs("basic");
  const advancedSpecs = numberSpecs("advanced");
  const fixedSpecs = numberSpecs("fixed");

  function label(key: OmrParamKey): string {
    return translate(`settings.omr.params.${key}.label`);
  }

  /** A param only the other algorithm reads: shown, but not editable while it is not selected. */
  function inactive(key: OmrParamKey, algorithm: OmrAlgorithm): boolean {
    const only = OMR_PARAM_ALGORITHM[key];
    return only !== undefined && only !== algorithm;
  }

  function fieldError(spec: NumberSpec, errs: OmrParamsError[]): string | undefined {
    return errs.some((e) => e.code === "range" && e.key === spec.key)
      ? translate("settings.omr.errors.range", { label: label(spec.key), min: spec.min, max: spec.max })
      : undefined;
  }

  function handleSave() {
    statusMsg = "";
    const params = {
      ...profile.params,
      ...Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v ?? Number.NaN])),
      shapeAnalysis: draftShapeAnalysis,
      algorithm: draftAlgorithm,
    } as OmrDetectionParams;
    errors = onSave(params);
    if (errors.length === 0) statusMsg = translate("settings.omr.saved");
  }

  function handleReset() {
    onReset();
    errors = [];
    statusMsg = translate("settings.omr.resetDone");
  }

  // Reads $t/$fmt at call time, so hints follow a language switch.
  function hintFor(spec: NumberSpec, algorithm: OmrAlgorithm): string {
    const base = `${$t(`settings.omr.params.${spec.key}.hint`)} ${$t("settings.omr.defaultValue", { value: $fmt.number(DEFAULT_OMR_PARAMS[spec.key]) })}`;
    return inactive(spec.key, algorithm)
      ? `${base} ${$t("settings.omr.onlyFor", { algorithm: OMR_PARAM_ALGORITHM[spec.key] ?? "" })}`
      : base;
  }

  let orderErrors = $derived(errors.filter((e) => e.code !== "range"));

  // Saved elsewhere (another tab, reset): take the new values over.
  $effect.pre(() => {
    const current = profile;
    untrack(() => {
      if (current.revision !== lastRevision) {
        lastRevision = current.revision;
        draft = toDraft(current.params);
        draftShapeAnalysis = current.params.shapeAnalysis;
        draftAlgorithm = current.params.algorithm;
        errors = [];
      }
    });
  });
</script>

<div id="omr" class="scroll-mt-16 lg:scroll-mt-4">
  <Card title={$t("settings.omr.heading")}>
    <p class="mt-0 mb-3 text-sm text-muted">{$t("settings.omr.description")}</p>
    <Alert class="mb-3">{$t("settings.omr.futureOnly")}</Alert>
    <p class="mt-0 mb-4 text-xs text-muted">
      {$t("settings.omr.localOnly")}
      {$t("settings.omr.profile", {
        source: $t(`settings.omr.source.${profile.source}`),
        revision: profile.revision,
      })}
    </p>

    <Field
      class="mb-4"
      label={$t("settings.omr.params.algorithm.label")}
      forId="omr-algorithm"
      hint={$t("settings.omr.params.algorithm.hint")}
    >
      <select id="omr-algorithm" class={controlClass} bind:value={draftAlgorithm}>
        {#each OMR_ALGORITHMS as a}
          <option value={a}>{$t(`settings.omr.params.algorithm.v${a}`)}</option>
        {/each}
      </select>
    </Field>

    <h3 class="m-0 mb-3 text-base font-semibold text-content">{$t("settings.omr.basicGroup")}</h3>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {#each basicSpecs as spec (spec.key)}
        <Field
          label={$t(`settings.omr.params.${spec.key}.label`)}
          forId={`omr-${spec.key}`}
          hint={hintFor(spec, draftAlgorithm)}
          error={fieldError(spec, errors)}
        >
          <input
            id={`omr-${spec.key}`}
            type="number"
            inputmode="decimal"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            class={controlClass}
            disabled={inactive(spec.key, draftAlgorithm)}
            bind:value={draft[spec.key]}
          />
        </Field>
      {/each}
    </div>

    <Checkbox class="mt-4 items-start" disabled={inactive("shapeAnalysis", draftAlgorithm)} bind:checked={draftShapeAnalysis}>
      <span class="block text-sm font-medium text-content">{$t("settings.omr.params.shapeAnalysis.label")}</span>
      <span class="block text-xs text-muted">
        {$t("settings.omr.params.shapeAnalysis.hint")}
        {#if inactive("shapeAnalysis", draftAlgorithm)}
          {$t("settings.omr.onlyFor", { algorithm: 2 })}
        {/if}
      </span>
    </Checkbox>

    <details class="mt-6">
      <summary class="cursor-pointer text-sm font-semibold text-content">{$t("settings.omr.advancedGroup")}</summary>
      <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {#each advancedSpecs as spec (spec.key)}
          <Field
            label={$t(`settings.omr.params.${spec.key}.label`)}
            forId={`omr-${spec.key}`}
            hint={hintFor(spec, draftAlgorithm)}
            error={fieldError(spec, errors)}
          >
            <input
              id={`omr-${spec.key}`}
              type="number"
              inputmode="decimal"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              class={controlClass}
              disabled={inactive(spec.key, draftAlgorithm)}
              bind:value={draft[spec.key]}
            />
          </Field>
        {/each}
        {#each fixedSpecs as spec (spec.key)}
          <Field
            label={`${$t(`settings.omr.params.${spec.key}.label`)} (${$t("settings.omr.fixedGroup")})`}
            forId={`omr-${spec.key}`}
            hint={$t(`settings.omr.params.${spec.key}.hint`)}
          >
            <input id={`omr-${spec.key}`} type="text" class={controlClass} value={$fmt.number(profile.params[spec.key])} disabled />
          </Field>
        {/each}
      </div>
    </details>

    {#each orderErrors as err}
      <p class="mt-3 mb-0 text-xs text-danger-fg">
        {err.code === "fillOrder" ? $t("settings.omr.errors.fillOrder") : $t("settings.omr.errors.areaOrder")}
      </p>
    {/each}
    {#if statusMsg}
      <p class="mt-3 mb-0 text-xs text-success-fg" role="status">{statusMsg}</p>
    {/if}

    <div class="mt-4 flex flex-wrap gap-2">
      <Button onClick={handleSave}>{$t("settings.omr.save")}</Button>
      <Button variant="outlined" severity="secondary" onClick={handleReset}>{$t("settings.omr.reset")}</Button>
    </div>
  </Card>
</div>
