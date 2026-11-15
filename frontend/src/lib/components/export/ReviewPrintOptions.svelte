<script lang="ts">
  import { t } from "#lib/i18n";
  import { OptionTile } from "#lib/components/ui";
  import { toggleReviewOption, type ReviewOptionKey, type ReviewPrintOptions } from "#lib/export/reviewPrint";
  import { saveReviewPrint, type ReviewPrintScope } from "#lib/export/reviewPrintPrefs";

  /** How the grading review is printed into graded PDFs (issue #226): combinable tiles, remembered per browser under *scope*. Shown only when there are objections; `hasReviews` null (unreadable) shows nothing. */
  interface Props {
    options: ReviewPrintOptions;
    scope: ReviewPrintScope;
    hasReviews: boolean | null;
    disabled?: boolean;
    /** Greys the attachment tile out and shows this reason in place of its hint. */
    attachUnavailable?: string;
    /** The "no objections" line for a single paper instead of the whole exam. */
    single?: boolean;
  }

  let { options = $bindable(), scope, hasReviews, disabled = false, attachUnavailable, single = false }: Props = $props();

  const tiles: { key: ReviewOptionKey; checked: (o: ReviewPrintOptions) => boolean }[] = [
    { key: "short", checked: (o) => o.short },
    { key: "side", checked: (o) => o.strip === "side" },
    { key: "bottom", checked: (o) => o.strip === "bottom" },
    { key: "summary", checked: (o) => o.summary },
    { key: "attach", checked: (o) => o.attach },
  ];

  function toggle(key: ReviewOptionKey, on: boolean) {
    options = toggleReviewOption(options, key, on);
    saveReviewPrint(scope, options);
  }
</script>

{#if hasReviews === false}
  <p class="m-0 text-sm text-muted">{$t(single ? "export.review.noReviewsStudent" : "export.review.noReviews")}</p>
{:else if hasReviews}
  <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" {disabled}>
    <legend class="mb-2 p-0 text-sm text-muted">{$t("export.review.legend")}</legend>
    <div class="@container">
      <div class="grid grid-cols-1 gap-2 @md:grid-cols-2">
        {#each tiles as tile (tile.key)}
          {@const blocked = tile.key === "attach" && !!attachUnavailable}
          <OptionTile
            type="checkbox"
            compact
            checked={!blocked && tile.checked(options)}
            disabled={blocked}
            title={$t(`export.review.options.${tile.key}`)}
            text={blocked ? attachUnavailable : $t(`export.review.options.${tile.key}Hint`)}
            onToggle={(on) => toggle(tile.key, on)}
          />
        {/each}
      </div>
    </div>
  </fieldset>
{/if}
