<script lang="ts">
  /** What the e-mail and Artemis channels need before sending (issue #209): e-mail addresses matched from a class list, or the Artemis course, token and mode. */
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Button, Radio } from "#lib/components/ui";
  import ArtemisConnect from "#lib/components/lms/ArtemisConnect.svelte";
  import ClassListFile from "#lib/components/lms/ClassListFile.svelte";
  import type { ArtemisCourse } from "#lib/api/integrations";
  import { matchContacts, type Contact, type ContactMatch } from "#lib/lms/contacts";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import type { ArtemisMode, ShareChannelId } from "#lib/sharing/channels";
  import type { ShareStudent } from "#lib/sharing/shareService";
  import { sessionStore } from "#lib/stores/session";
  import { formatStudentName } from "#lib/utils/studentQr";

  interface Props {
    channel: ShareChannelId;
    students: readonly ShareStudent[];
    disabled?: boolean;
    artemisCourse?: ArtemisCourse | null;
    artemisMode?: ArtemisMode;
    /** Addresses were saved; the dialog reloads its students. */
    onSaved: () => void;
  }

  let { channel, students, disabled = false, artemisCourse = $bindable(null), artemisMode = $bindable("link"), onSaved }: Props = $props();

  let pending = $state.raw<{ matches: ContactMatch[]; unmatched: string[]; fileName: string } | null>(null);
  let saving = $state(false);
  let error = $state("");

  let withEmail = $derived(students.filter((s) => s.student.email).length);

  function imported(contacts: Contact[], fileName: string) {
    const result = matchContacts(
      students.map((s) => s.student),
      contacts.filter((c) => c.email)
    );
    pending = {
      matches: result.matches.filter((m) => m.contact.email !== m.student.email),
      unmatched: result.unmatchedStudents.filter((st) => !st.email).map((st) => formatStudentName(st.studentName) || "?"),
      fileName,
    };
  }

  async function save() {
    if (!pending) return;
    saving = true;
    error = "";
    try {
      const key = get(sessionStore).sessionKey;
      for (const { student, contact } of pending.matches) await studentRepository.save({ ...student, email: contact.email ?? undefined }, key);
      pending = null;
      onSaved();
    } catch (err) {
      error = `${$t("lms.email.saveFailed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      saving = false;
    }
  }
</script>

<div class="ml-7 flex min-w-0 flex-col gap-3 rounded-md border border-line p-3">
  {#if channel === "email"}
    <p class="m-0 text-sm">{$t("lms.email.count", { count: withEmail, total: students.length })}</p>
    <ClassListFile paste disabled={disabled || saving} onContacts={imported} />
    {#if pending}
      <div class="flex flex-col gap-2 text-sm">
        <p class="m-0">{$t("lms.email.matched", { count: pending.matches.length, file: pending.fileName })}</p>
        {#if pending.matches.length}
          <ul class="m-0 max-h-40 list-none overflow-auto p-0">
            {#each pending.matches as m (m.student.pseudonymHmac)}
              <li class="flex flex-wrap gap-x-2"><span>{formatStudentName(m.student.studentName)}</span><span class="text-muted">{m.contact.email}</span></li>
            {/each}
          </ul>
        {/if}
        {#if pending.unmatched.length}
          <p class="m-0 text-warning-fg">{$t("lms.email.unmatched", { names: pending.unmatched.join(", ") })}</p>
        {/if}
        <p class="m-0 text-muted">{$t("lms.email.storedNote")}</p>
        <div class="flex gap-2">
          <Button size="sm" loading={saving} disabled={disabled || saving || !pending.matches.length} onClick={save}>{$t("lms.email.save", { count: pending.matches.length })}</Button>
          <Button size="sm" variant="text" severity="secondary" disabled={saving} onClick={() => (pending = null)}>{$t("common.cancel")}</Button>
        </div>
      </div>
    {/if}
    {#if error}<p class="m-0 text-sm text-danger-fg" role="alert">{error}</p>{/if}
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
