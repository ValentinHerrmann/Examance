<script lang="ts">
  /** What the e-mail and Artemis channels need before sending (issue #209): how many students have an address (entered on the Students page), or the Artemis course, token and mode. */
  import { t } from "#lib/i18n";
  import { Button, Radio } from "#lib/components/ui";
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

<div class="ml-7 flex min-w-0 flex-col gap-3 rounded-md border border-line p-3">
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
      <div>
        <Radio group={artemisMode} value="link" name="artemis-mode" onchange={() => (artemisMode = "link")} label={$t("lms.artemis.modeLink")} />
        <p class="ml-7 text-sm text-muted">{$t("lms.artemis.modeLinkHint")}</p>
      </div>
      <div>
        <Radio group={artemisMode} value="pdf" name="artemis-mode" onchange={() => (artemisMode = "pdf")} label={$t("lms.artemis.modePdf")} />
        <p class="ml-7 text-sm text-muted">{$t("lms.artemis.modePdfHint")}</p>
      </div>
    </fieldset>
  {/if}
</div>
