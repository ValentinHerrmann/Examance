<script lang="ts">
  /** Picks a class list file: a Mebis (Moodle) CSV export, or a plain list with one student per line (issue #209). Read in the browser only. */
  import { faFileCsv } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button } from "#lib/components/ui";
  import { contactsFromLines, contactsFromMebisCsv, type Contact } from "#lib/lms/contacts";

  interface Props {
    disabled?: boolean;
    onContacts: (contacts: Contact[], fileName: string) => void;
  }

  let { disabled = false, onContacts }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state("");

  async function picked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = "";
    try {
      const text = await file.text();
      const contacts = contactsFromMebisCsv(text) ?? contactsFromLines(text);
      if (!contacts.length) error = $t("lms.file.empty");
      else onContacts(contacts, file.name);
    } catch {
      error = $t("lms.file.unreadable");
    }
  }
</script>

<div class="flex flex-col gap-1">
  <input bind:this={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden" onchange={picked} />
  <div>
    <Button size="sm" variant="outlined" icon={faFileCsv} {disabled} onClick={() => fileInput?.click()}>{$t("lms.file.pick")}</Button>
  </div>
  <p class="m-0 text-sm text-muted">{$t("lms.file.hint")}</p>
  {#if error}<p class="m-0 text-sm text-danger-fg" role="alert">{error}</p>{/if}
</div>
