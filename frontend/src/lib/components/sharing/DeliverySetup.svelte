<script lang="ts">
  /** What the e-mail and Artemis channels need before sending (issue #209): how many students have an address (entered on the Students page), or the Artemis course, token and mode. */
  import { t } from "#lib/i18n";
  import { faFilePdf, faLink } from "@fortawesome/free-solid-svg-icons";
  import { Button, OptionTile } from "#lib/components/ui";
  import ArtemisConnect from "#lib/components/lms/ArtemisConnect.svelte";
  import type { ArtemisCourse } from "#lib/api/integrations";
  import type { ArtemisMode, ShareChannelId } from "#lib/sharing/channels";
  import type { ShareStudent } from "#lib/sharing/shareService";
  import { studentsHref } from "#lib/utils/links";

  interface Props {
    examId: string;
    channel: ShareChannelId;
    students: readonly ShareStudent[];
    disabled?: boolean;
    artemisCourse?: ArtemisCourse | null;
    artemisMode?: ArtemisMode;
  }

  let { examId, channel, students, disabled = false, artemisCourse = $bindable(null), artemisMode = $bindable("link") }: Props = $props();

  let withEmail = $derived(students.filter((s) => s.student.email).length);
</script>

<div class="flex min-w-0 flex-col gap-3 rounded-md border border-line p-3">
  {#if channel === "email"}
    <!-- Addresses are student data: entered only on the Students page. -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{$t("lms.email.count", { count: withEmail, total: students.length })}</span>
      <Button size="sm" variant="text" href={studentsHref(examId)}>{$t("lms.students.manage")}</Button>
    </div>
  {:else if channel === "artemis"}
    <ArtemisConnect bind:course={artemisCourse} {disabled} />
    <fieldset class="flex flex-col gap-2" {disabled}>
      <legend class="mb-1 text-sm text-muted">{$t("lms.artemis.mode")}</legend>
      <div class="@container">
        <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
          <OptionTile compact name="artemis-mode" value="link" checked={artemisMode === "link"} icon={faLink} title={$t("lms.artemis.modeLink")} text={$t("lms.artemis.modeLinkHint")} onchange={() => (artemisMode = "link")} />
          <OptionTile compact name="artemis-mode" value="pdf" checked={artemisMode === "pdf"} icon={faFilePdf} title={$t("lms.artemis.modePdf")} text={$t("lms.artemis.modePdfHint")} onchange={() => (artemisMode = "pdf")} />
        </div>
      </div>
    </fieldset>
  {/if}
</div>
