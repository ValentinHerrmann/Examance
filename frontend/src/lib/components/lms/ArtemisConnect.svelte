<script lang="ts">
  /** Artemis course and session token for loading a class list or delivering results (issue #209). The token stays in memory only; host and course id are remembered in this browser for convenience. */
  import { faCloudArrowDown } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button, Field, TextInput } from "#lib/components/ui";
  import { fetchArtemisStudents, type ArtemisCourse, type ArtemisStudent } from "#lib/api/integrations";
  import { safeLocalStorage } from "#lib/utils/storage";

  interface Props {
    /** The connection, or null while it is incomplete. */
    course?: ArtemisCourse | null;
    disabled?: boolean;
    /** Shows "load students" and reports the course's students. */
    onLoaded?: (students: ArtemisStudent[]) => void;
  }

  let { course = $bindable(null), disabled = false, onLoaded }: Props = $props();

  const REMEMBER_KEY = "bg_artemis_course";
  const remembered = (() => {
    try {
      return JSON.parse(safeLocalStorage.getItem(REMEMBER_KEY) ?? "null") as { host?: string; courseId?: string } | null;
    } catch {
      return null;
    }
  })();

  let host = $state(remembered?.host ?? "artemis.tum.de");
  let courseId = $state(remembered?.courseId ?? "");
  let jwt = $state("");
  let loading = $state(false);
  let error = $state("");
  let loadedCount = $state<number | null>(null);

  function current(): ArtemisCourse | null {
    const id = Number(courseId.trim());
    const h = host.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    return h && Number.isInteger(id) && id > 0 && jwt.trim() ? { host: h, courseId: id, jwt: jwt.trim() } : null;
  }

  function update() {
    course = current();
    loadedCount = null;
    safeLocalStorage.setItem(REMEMBER_KEY, JSON.stringify({ host: host.trim(), courseId: courseId.trim() }));
  }

  async function load() {
    const c = current();
    if (!c || !onLoaded) return;
    loading = true;
    error = "";
    try {
      const students = await fetchArtemisStudents(c);
      loadedCount = students.length;
      onLoaded(students);
    } catch (err) {
      error = `${$t("lms.artemis.loadFailed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-w-0 flex-col gap-3">
  <div class="grid min-w-0 gap-3 sm:grid-cols-2">
    <Field label={$t("lms.artemis.host")}>
      {#snippet children({ id })}
        <TextInput {id} bind:value={host} oninput={update} {disabled} placeholder="artemis.tum.de" autocomplete="off" />
      {/snippet}
    </Field>
    <Field label={$t("lms.artemis.courseId")} hint={$t("lms.artemis.courseIdHint")}>
      {#snippet children({ id })}
        <TextInput {id} bind:value={courseId} oninput={update} {disabled} inputmode="numeric" autocomplete="off" />
      {/snippet}
    </Field>
  </div>
  <Field label={$t("lms.artemis.token")} hint={$t("lms.artemis.tokenHint")}>
    {#snippet children({ id })}
      <TextInput {id} type="password" bind:value={jwt} oninput={update} {disabled} autocomplete="off" />
    {/snippet}
  </Field>
  {#if onLoaded}
    <div class="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outlined" icon={faCloudArrowDown} loading={loading} disabled={disabled || loading || !course} onClick={load}>
        {$t("lms.artemis.load")}
      </Button>
      {#if loadedCount !== null}<span class="text-sm text-muted">{$t("lms.artemis.loaded", { count: loadedCount })}</span>{/if}
    </div>
  {/if}
  {#if error}<p class="text-sm text-danger-fg" role="alert">{error}</p>{/if}
</div>
