<script lang="ts">
  /** Step 3 of sharing results (issue #212): link protection, the code in the message, the sample solution and how long links stay valid. */
  import { t } from "#lib/i18n";
  import { Button, Checkbox, Field, Radio, Select, actionIcons } from "#lib/components/ui";
  import { SHARE_FACTORS } from "#lib/sharing/channels";
  import type { ShareFactor } from "#lib/sharing/shareCrypto";
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
  }: Props = $props();
</script>

<div class="flex flex-col gap-5">
  {#if sendsPdf}
    <p class="m-0 text-sm text-muted">{$t("sharing.page.pdfNoOptions")}</p>
  {:else}
    <fieldset class="flex flex-col gap-2" disabled={running}>
      <legend class="mb-2 text-sm text-muted">{$t("sharing.share.factor")}</legend>
      {#each SHARE_FACTORS as f (f)}
        <div class={factorMuted(f) ? "opacity-60" : ""} title={f === factor ? undefined : $t(`sharing.factor.${f}Hint`)}>
          <Radio group={factor} value={f} name="share-factor" disabled={factorMuted(f)} onchange={() => (factor = f)} label={$t(`sharing.factor.${f}`)} />
          {#if f === factor}<p class="m-0 ml-7 text-sm text-muted">{$t(`sharing.factor.${f}Hint`)}</p>{/if}
          {#if f === "sticker" && chosenCount > 0 && blockedCount(f) > 0}
            <p class="ml-7 flex flex-wrap items-center gap-2 text-sm text-warning-fg">
              {factorMuted(f) ? $t("sharing.factor.noStickerAny") : $t("sharing.factor.someNoSticker", { count: blockedCount(f) })}
              <Button size="sm" variant="text" icon={actionIcons.print} onClick={onPrintKeys}>{$t("sharing.factor.printKeys")}</Button>
            </p>
          {/if}
        </div>
      {/each}
    </fieldset>

    {#if sendsMessage && factor !== "none"}
      <div>
        <Checkbox bind:checked={includeCode} label={$t("sharing.share.includeCode")} disabled={running} />
        <p class="ml-7 text-sm text-muted">{$t("sharing.share.includeCodeHint")}</p>
        {#if includeCode}
          <p class="ml-7 text-sm text-warning-fg">{$t("sharing.share.includeCodeWarning")}</p>
        {/if}
      </div>
    {/if}

    <div>
      <Checkbox bind:checked={includeSolution} label={$t("sharing.share.includeSolution")} disabled={running || !solutionAvailable} />
      <p class="ml-7 text-sm text-muted">{solutionAvailable ? $t("sharing.share.includeSolutionHint") : $t("sharing.share.solutionWithheld")}</p>
    </div>
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
