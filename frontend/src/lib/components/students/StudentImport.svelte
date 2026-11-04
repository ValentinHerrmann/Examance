<script lang="ts">
  import { faCheck, faFileCsv, faPaste } from "@fortawesome/free-solid-svg-icons";
  /** Imports a class list into the exam's students (issue #209): a Mebis CSV, a pasted or typed list, or an Artemis course. Shows what changes before anything is written. */
  import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Button, Icon, Panel, Tabs, actionIcons } from "#lib/components/ui";
  import ArtemisConnect from "#lib/components/lms/ArtemisConnect.svelte";
  import ClassListFile from "#lib/components/lms/ClassListFile.svelte";
  import type { ArtemisStudent } from "#lib/api/integrations";
  import type { StudentRecord } from "#lib/db/schema";
  import type { Contact } from "#lib/lms/contacts";
  import { applyImport, planImport, type ImportPlan } from "#lib/students/classList";
  import { featuresStore } from "#lib/stores/capabilities";
  import { sessionStore } from "#lib/stores/session";
  import { formatStudentName } from "#lib/utils/studentQr";

  interface Props {
    examId: string;
    students: readonly StudentRecord[];
    /** The import was written; the page reloads its students. */
    onImported: () => void;
  }

  let { examId, students, onImported }: Props = $props();

  let pending = $state.raw<{ plan: ImportPlan; source: string } | null>(null);
  let source = $state<"file" | "paste" | "artemis">("file");
  let sources = $derived([
    { id: "file", label: $t("lms.students.import.sourceFile"), icon: faFileCsv },
    { id: "paste", label: $t("lms.students.import.sourcePaste"), icon: faPaste },
    { id: "artemis", label: $t("lms.students.import.sourceArtemis"), icon: actionIcons.download },
  ]);
  let saving = $state(false);
  let error = $state("");

  function received(contacts: Contact[], source: string) {
    error = "";
    pending = { plan: planImport(students, contacts), source };
  }

  const fromArtemis = (list: ArtemisStudent[]) => received(list.map((s) => ({ name: s.name, id: String(s.id), email: s.email, source: "artemis" as const })), "Artemis");

  async function apply() {
    if (!pending) return;
    saving = true;
    error = "";
    try {
      await applyImport(examId, pending.plan, get(sessionStore).sessionKey);
      pending = null;
      onImported();
    } catch (err) {
      error = `${$t("lms.students.import.failed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      saving = false;
    }
  }
</script>

<Panel title={$t("lms.students.import.title")}>
  <div class="flex min-w-0 flex-col gap-4">
    <p class="m-0 text-sm text-muted">{$t("lms.students.import.intro")}</p>
    <!-- Three ways to the same result: one choice, one panel (issue #212). -->
    <Tabs compact items={sources} value={source} label={$t("lms.students.import.title")} onChange={(id) => (source = id as typeof source)} />
    {#if source === "file"}
      <ClassListFile disabled={saving} onContacts={received} />
    {:else if source === "paste"}
      <ClassListFile mode="paste" disabled={saving} onContacts={received} />
    {:else if $featuresStore.result_delivery}
      <ArtemisConnect disabled={saving} onLoaded={fromArtemis} />
    {:else}
      <p class="m-0 flex items-start gap-1.5 text-sm text-muted"><Icon icon={faCircleInfo} class="mt-0.5 shrink-0" />{$t("lms.artemis.importDisabled")}</p>
    {/if}

    {#if pending}
      {@const plan = pending.plan}
      <div class="flex flex-col gap-2 rounded-md border border-line p-3 text-sm" aria-live="polite">
        <p class="m-0 font-semibold">{$t("lms.students.import.preview", { source: pending.source })}</p>
        <p class="m-0">{$t("lms.students.import.counts", { add: plan.add.length, update: plan.update.length, unchanged: plan.unchanged })}</p>
        {#if plan.add.length}
          <p class="m-0 text-muted">{$t("lms.students.import.newNames", { names: plan.add.map((c) => formatStudentName(c.name)).join(", ") })}</p>
        {/if}
        {#if plan.update.length}
          <ul class="m-0 max-h-40 list-none overflow-auto p-0">
            {#each plan.update as u (u.student.pseudonymHmac)}
              <li class="flex flex-wrap gap-x-2"><span>{formatStudentName(u.student.studentName)}</span><span class="text-muted">{[u.changes.mebisId && `Mebis ${u.changes.mebisId}`, u.changes.artemisId && `Artemis ${u.changes.artemisId}`, u.changes.email].filter(Boolean).join(" · ")}</span></li>
            {/each}
          </ul>
        {/if}
        <p class="m-0 text-muted">{$t("lms.students.import.storedNote")}</p>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" icon={faCheck} loading={saving} disabled={saving || !(plan.add.length + plan.update.length)} onClick={apply}>{$t("lms.students.import.apply")}</Button>
          <Button size="sm" variant="text" severity="secondary" disabled={saving} onClick={() => (pending = null)}>{$t("common.cancel")}</Button>
        </div>
      </div>
    {/if}
    {#if error}<p class="m-0 text-sm text-danger-fg" role="alert">{error}</p>{/if}
  </div>
</Panel>
