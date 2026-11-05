<script lang="ts">
  /** Step 2 of sharing results (issue #212): how the results reach the students. A channel the account or server cannot use stays listed, greyed out with its reason. */
  import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
  import { t, LOCALE_LABELS, LOCALES } from "#lib/i18n";
  import type { Locale } from "#lib/i18n/types";
  import type { TranslationKey } from "#lib/i18n";
  import { Field, Icon, Radio, Select } from "#lib/components/ui";
  import type { ArtemisCourse } from "#lib/api/integrations";
  import { SHARE_CHANNELS, type ArtemisMode, type ShareChannelId } from "#lib/sharing/channels";
  import type { ShareStudent } from "#lib/sharing/shareService";
  import DeliverySetup from "./DeliverySetup.svelte";

  interface Props {
    examId: string;
    students: readonly ShareStudent[];
    /** The usable channel in effect. */
    channel: ShareChannelId;
    /** Why a channel cannot be used, per channel (null = usable). */
    unavailable: Map<ShareChannelId, TranslationKey | null>;
    running: boolean;
    /** E-mail and Artemis write a message, so its language is asked. */
    sendsMessage: boolean;
    onChoose: (id: ShareChannelId) => void;
    artemisCourse: ArtemisCourse | null;
    artemisMode: ArtemisMode;
    language: Locale;
  }

  let {
    examId,
    students,
    channel,
    unavailable,
    running,
    sendsMessage,
    onChoose,
    artemisCourse = $bindable(null),
    artemisMode = $bindable("link"),
    language = $bindable("de"),
  }: Props = $props();
</script>

<div class="flex flex-col gap-4">
  <fieldset class="flex flex-col gap-2" disabled={running}>
    <legend class="sr-only">{$t("sharing.share.channel")}</legend>
    {#each SHARE_CHANNELS as c (c.id)}
      {@const reason = unavailable.get(c.id)}
      <!-- Only the chosen way shows its description (the others on hover), so the column stays short (issue #212). -->
      <div class={reason ? "opacity-60" : ""} title={c.id === channel ? undefined : $t(c.descriptionKey)}>
        <Radio group={channel} value={c.id} name="share-channel" disabled={!!reason} onchange={() => onChoose(c.id)} label={$t(c.labelKey)} />
        {#if c.id === channel}<p class="m-0 ml-7 text-sm text-muted">{$t(c.descriptionKey)}</p>{/if}
        {#if reason}
          <p class="ml-7 flex items-start gap-1.5 text-sm text-muted"><Icon icon={faCircleInfo} class="mt-0.5 shrink-0" />{$t(reason)}</p>
        {/if}
      </div>
      {#if c.id === channel && (c.id === "email" || c.id === "artemis")}
        <DeliverySetup {examId} channel={c.id} {students} disabled={running} bind:artemisCourse bind:artemisMode />
      {/if}
    {/each}
  </fieldset>

  {#if sendsMessage}
    <Field label={$t("sharing.share.language")} hint={$t("sharing.share.languageHint")}>
      {#snippet children({ id })}
        <Select {id} bind:value={language} disabled={running}>
          {#each LOCALES as l (l)}<option value={l}>{LOCALE_LABELS[l]}</option>{/each}
        </Select>
      {/snippet}
    </Field>
  {/if}
</div>
