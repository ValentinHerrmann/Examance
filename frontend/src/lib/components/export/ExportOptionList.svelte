<script lang="ts">
  import { t } from "#lib/i18n";
  import { OptionTile } from "#lib/components/ui";
  import type { ExportOption } from "./ExportOptionsModal.svelte";
  import type { ReviewPrintOptions as ReviewPrintChoice } from "#lib/export/reviewPrint";
  import ReviewPrintOptions from "./ReviewPrintOptions.svelte";

  /** The parts of a raw export as toggle tiles (modal and the Archive tab share it, issue #228); `checked` maps option keys to their state. */
  interface Props {
    options: ExportOption[];
    checked: Record<string, boolean>;
    disabled?: boolean;
    /** Set (bindable) to offer how the grading review is printed into the graded PDFs (issue #226); shown while a graded-PDF part is chosen. */
    reviewPrint?: ReviewPrintChoice;
    /** Whether the exam has objections (null: unknown); the review tiles show only then. */
    hasReviews?: boolean | null;
  }

  let { options, checked = $bindable(), disabled = false, reviewPrint = $bindable(), hasReviews = null }: Props = $props();
</script>

<fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" {disabled}>
  <legend class="mb-2 p-0 text-sm text-muted">{$t("export.dialog.chooseParts")}</legend>
  <div class="@container">
    <div class="grid grid-cols-1 gap-2 @md:grid-cols-2">
      {#each options as option (option.key)}
        <OptionTile type="checkbox" compact checked={checked[option.key] === true} disabled={option.disabled || disabled} title={option.label} text={option.hint} onToggle={(on) => (checked = { ...checked, [option.key]: on })} />
      {/each}
    </div>
  </div>
</fieldset>

{#if reviewPrint !== undefined && (checked.graded || checked.gradedCombined)}
  <div class="mt-6">
    <ReviewPrintOptions bind:options={reviewPrint} scope="export" {hasReviews} {disabled} attachUnavailable={checked.graded ? undefined : $t("export.review.options.attachNeedsSingle")} />
  </div>
{/if}
