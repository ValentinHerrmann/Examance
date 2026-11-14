<script lang="ts">
  /** The last step before results leave Examance by e-mail or Artemis (issue #209): who gets what at which address, who is skipped and why, and which data is used, passed on and stored where. */
  import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
  import { LOCALE_LABELS, t } from "#lib/i18n";
  import type { Locale } from "#lib/i18n/types";
  import { Alert, Button, Modal, TableScroller } from "#lib/components/ui";
  import type { ArtemisCourse } from "#lib/api/integrations";
  import { incompatibleStudents, sendsPdf as channelSendsPdf, type ArtemisMode, type ShareChannel } from "#lib/sharing/channels";
  import type { ShareFactor } from "#lib/sharing/shareCrypto";
  import type { ShareStudent } from "#lib/sharing/shareService";
  import { resultsAreLocal } from "#lib/stores/storagePolicy";
  import { artemisIdOf } from "#lib/utils/studentQr";

  interface Props {
    channel: ShareChannel;
    students: readonly ShareStudent[];
    factor: ShareFactor;
    language: Locale;
    /** The key or code goes into the message itself. */
    includeCode: boolean;
    artemis: (ArtemisCourse & { mode: ArtemisMode }) | null;
    /** Students whose current link, with an open objection, the new link replaces (issue #226). */
    keptNames?: string[];
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { channel, students, factor, language, includeCode, artemis, keptNames = [], onConfirm, onCancel }: Props = $props();

  let sendsPdf = $derived(channelSendsPdf(channel.id, artemis?.mode ?? "link"));
  let blocked = $derived(new Map(incompatibleStudents(sendsPdf ? null : factor, channel, students.map((s) => s.student)).map((b) => [b.student, b.reason])));
  let reachable = $derived(students.filter((s) => !blocked.has(s.student)));

  const recipient = (s: ShareStudent) => (channel.id === "email" ? (s.student.email ?? "") : `${$t("lms.preview.artemisUser")} ${artemisIdOf(s.student) ?? ""}`);
  let what = $derived(sendsPdf ? $t("lms.preview.whatPdf") : $t(factor === "code" ? "lms.preview.whatLinkCode" : "lms.preview.whatLinkSticker"));
</script>

<Modal open={true} size="large" title={$t("lms.preview.title")} onClose={onCancel}>
  <div class="flex min-w-0 flex-col gap-4">
    <p class="m-0 text-sm text-muted">{$t("lms.preview.intro", { count: reachable.length })}</p>
    <TableScroller maxHeight="max-h-72">
      <table class="data-table data-table-compact w-full">
        <thead>
          <tr>
            <th>{$t("lms.preview.colStudent")}</th>
            <th>{$t("lms.preview.colRecipient")}</th>
            <th>{$t("lms.preview.colWhat")}</th>
          </tr>
        </thead>
        <tbody>
          {#each students as s (s.key)}
            {@const reason = blocked.get(s.student)}
            <tr class={reason ? "text-muted" : ""}>
              <td>{s.name}</td>
              <td class="break-all">{reason ? "—" : recipient(s)}</td>
              <td>{reason ? `${$t("lms.preview.skipped")}: ${$t(reason)}` : what}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>

    {#if keptNames.length > 0 && !sendsPdf}
      <Alert severity="info" title={$t("review.replace.title")}>{$t("review.replace.note", { names: keptNames.join(", ") })}</Alert>
    {/if}

    <Alert severity={sendsPdf ? "warning" : "info"} title={$t("lms.preview.dataTitle")}>
      <ul class="m-0 list-disc pl-5">
        {#if channel.id === "email"}
          <li>{$t("lms.preview.emailUsed")}</li>
          <li>{resultsAreLocal() ? $t("lms.preview.emailStoredLocal") : $t("lms.preview.emailStoredServer")}</li>
          <li>{$t("lms.preview.emailServer")}</li>
        {:else}
          <li>{$t("lms.preview.artemisUsed", { host: artemis?.host ?? "", course: artemis?.courseId ?? "" })}</li>
          <li>{$t("lms.preview.artemisToken")}</li>
          <li>{sendsPdf ? $t("lms.preview.artemisPdf") : $t("lms.preview.artemisLink")}</li>
        {/if}
        <li>{$t("lms.preview.language", { language: LOCALE_LABELS[language] })}</li>
        {#if !sendsPdf && includeCode}
          <li class="text-warning-fg">{$t("lms.preview.codeIncluded")}</li>
          <li>{$t("lms.preview.ciphertext")}</li>
        {:else if !sendsPdf}
          <li>{factor === "code" ? $t("lms.preview.secondCode") : $t("lms.preview.secondSticker")}</li>
          <li>{$t("lms.preview.ciphertext")}</li>
        {/if}
        {#if resultsAreLocal()}<li>{$t("lms.preview.hybrid")}</li>{/if}
      </ul>
    </Alert>
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onCancel}>{$t("common.cancel")}</Button>
    <Button icon={faPaperPlane} disabled={!reachable.length} onClick={onConfirm}>{$t("lms.preview.send", { count: reachable.length })}</Button>
  {/snippet}
</Modal>
