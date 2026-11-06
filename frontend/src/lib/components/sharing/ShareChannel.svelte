<script lang="ts">
  /** Step 2 of sharing results (issue #212): how the results reach the students. A channel the account or server cannot use stays listed, greyed out with its reason. */
  import { faEnvelope, faGraduationCap, faReceipt, faSchool } from "@fortawesome/free-solid-svg-icons";
  import { t, LOCALE_LABELS, LOCALES } from "#lib/i18n";
  import type { Locale } from "#lib/i18n/types";
  import type { TranslationKey } from "#lib/i18n";
  import { Field, OptionTile, Select } from "#lib/components/ui";
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

  const channelIcon: Record<ShareChannelId, typeof faEnvelope> = { slips: faReceipt, email: faEnvelope, artemis: faGraduationCap, mebis: faSchool };
</script>

<div class="flex flex-col gap-4">
  <fieldset class="flex flex-col gap-2" disabled={running}>
    <legend class="sr-only">{$t("sharing.share.channel")}</legend>
    {#each SHARE_CHANNELS as c (c.id)}
      {@const reason = unavailable.get(c.id)}
      <!-- A tile per way (issue #228): its description as the line, or why it is greyed out (never hidden). -->
      <OptionTile compact name="share-channel" value={c.id} checked={channel === c.id} disabled={!!reason} icon={channelIcon[c.id]} title={$t(c.labelKey)} text={reason ? $t(reason) : $t(c.descriptionKey)} onchange={() => onChoose(c.id)} />
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
