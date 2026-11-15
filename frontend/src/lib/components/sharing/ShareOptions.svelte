<script lang="ts">
  /** Step 3 of sharing results (issue #212): link protection, the code in the message, the sample solution and how long links stay valid. */
  import { t } from "#lib/i18n";
  import { faFileCircleCheck, faKey, faLink, faMessage, faTag } from "@fortawesome/free-solid-svg-icons";
  import { Button, Field, OptionTile, Select, TextInput, actionIcons } from "#lib/components/ui";
  import ReviewPrintOptions from "#lib/components/export/ReviewPrintOptions.svelte";
  import type { ReviewPrintOptions as ReviewPrintChoice } from "#lib/export/reviewPrint";
  import { SHARE_FACTORS } from "#lib/sharing/channels";
  import type { ShareFactor } from "#lib/sharing/shareCrypto";
  import { dateInputValue, reviewDateValid } from "#lib/sharing/reviewItems";
  import { SHARE_EXPIRY_DAYS } from "#lib/sharing/shareService";

  interface Props {
    running: boolean;
    /** The channel sends the PDF itself (Mebis, Artemis PDF mode): no link, so no factor or solution. */
    sendsPdf: boolean;
    sendsMessage: boolean;
    solutionAvailable: boolean;
    /** How many chosen students a factor cannot serve, and whether it is muted altogether. */
    blockedCount: (f: ShareFactor) => number;
    factorMuted: (f: ShareFactor) => boolean;
    chosenCount: number;
    /** Opens the key-slip printing on top of the page. */
    onPrintKeys: () => void;
    factor: ShareFactor;
    includeCode: boolean;
    includeSolution: boolean;
    expiry: string;
    /** Allow objections until `reviewDate` (issue #226); the date is capped at the link's expiry when sending. */
    reviewOn: boolean;
    reviewDate: string;
    /** What of the review the student's PDF prints (remembered under the `share` scope); shown only when the exam has objections (null: unknown). */
    reviewPrint: ReviewPrintChoice;
    hasReviews: boolean | null;
  }

  let {
    running,
    sendsPdf,
    sendsMessage,
    solutionAvailable,
    blockedCount,
    factorMuted,
    chosenCount,
    onPrintKeys,
    factor = $bindable("none"),
    includeCode = $bindable(false),
    includeSolution = $bindable(false),
    expiry = $bindable("14"),
    reviewOn = $bindable(false),
    reviewDate = $bindable(""),
    reviewPrint = $bindable(),
    hasReviews,
  }: Props = $props();

  let reviewMax = $derived(dateInputValue(Number(expiry) || 0));
  const reviewMin = dateInputValue(0);

  const factorIcon: Record<ShareFactor, typeof faLink> = { none: faLink, sticker: faTag, code: faKey };
</script>

<div class="flex flex-col gap-5">
  {#if sendsPdf}
    <p class="m-0 text-sm text-muted">{$t("sharing.page.pdfNoOptions")}</p>
  {:else}
    <fieldset class="flex flex-col gap-2" disabled={running}>
      <legend class="mb-2 text-sm text-muted">{$t("sharing.share.factor")}</legend>
      {#each SHARE_FACTORS as f (f)}
        <div class="flex flex-col gap-1">
          <OptionTile compact name="share-factor" value={f} checked={factor === f} disabled={factorMuted(f)} icon={factorIcon[f]} title={$t(`sharing.factor.${f}`)} text={$t(`sharing.factor.${f}Hint`)} onchange={() => (factor = f)} />
          {#if f === "sticker" && chosenCount > 0 && blockedCount(f) > 0}
            <p class="m-0 flex flex-wrap items-center gap-2 text-sm text-warning-fg">
              {factorMuted(f) ? $t("sharing.factor.noStickerAny") : $t("sharing.factor.someNoSticker", { count: blockedCount(f) })}
              <Button size="sm" variant="text" icon={actionIcons.print} onClick={onPrintKeys}>{$t("sharing.factor.printKeys")}</Button>
            </p>
          {/if}
        </div>
      {/each}
    </fieldset>

    {#if sendsMessage && factor !== "none"}
      <div class="flex flex-col gap-1">
        <OptionTile type="checkbox" compact checked={includeCode} disabled={running} icon={faKey} title={$t("sharing.share.includeCode")} text={$t("sharing.share.includeCodeHint")} onToggle={(on) => (includeCode = on)} />
        {#if includeCode}
          <p class="m-0 text-sm text-warning-fg">{$t("sharing.share.includeCodeWarning")}</p>
        {/if}
      </div>
    {/if}

    <div class="flex flex-col gap-2">
      <OptionTile type="checkbox" compact checked={reviewOn} disabled={running} icon={faMessage} title={$t("review.share.title")} text={$t("review.share.text")} onToggle={(on) => (reviewOn = on)} />
      {#if reviewOn}
        <Field label={$t("review.share.until")} hint={$t("review.share.untilHint")}>
          {#snippet children({ id })}
            <TextInput {id} type="date" bind:value={reviewDate} min={reviewMin} max={reviewMax} disabled={running} invalid={!reviewDateValid(reviewDate, Number(expiry))} />
          {/snippet}
        </Field>
      {/if}
    </div>

    <ReviewPrintOptions bind:options={reviewPrint} scope="share" {hasReviews} disabled={running} attachUnavailable={$t("export.review.options.attachShare")} />

    <OptionTile type="checkbox" compact checked={includeSolution} disabled={running || !solutionAvailable} icon={faFileCircleCheck} title={$t("sharing.share.includeSolution")} text={solutionAvailable ? $t("sharing.share.includeSolutionHint") : $t("sharing.share.solutionWithheld")} onToggle={(on) => (includeSolution = on)} />
  {/if}

  <!-- A PDF sent directly has no link, so there is nothing to expire: no option that does nothing. -->
  {#if !sendsPdf}
    <Field label={$t("sharing.share.expiry")} hint={$t("sharing.share.replaceNote")}>
      {#snippet children({ id })}
        <Select {id} bind:value={expiry} disabled={running}>
          {#each SHARE_EXPIRY_DAYS as days (days)}
            <option value={String(days)}>{$t("sharing.share.days", { count: days })}</option>
          {/each}
        </Select>
      {/snippet}
    </Field>
  {/if}
</div>
