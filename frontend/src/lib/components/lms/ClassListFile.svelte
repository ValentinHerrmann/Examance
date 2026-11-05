<script lang="ts">
  /** Picks a class list: a Mebis (Moodle) CSV export or a plain list with one student per line, from a file or, with `paste`, typed or pasted (issue #209). Read in the browser only. */
  import { faFileCsv } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button, Field, Textarea } from "#lib/components/ui";
  import { contactsFromLines, contactsFromMebisCsv, type Contact } from "#lib/lms/contacts";

  interface Props {
    disabled?: boolean;
    /** `file` (default): pick a CSV or list file; `paste`: a text box for a typed or pasted list instead. */
    mode?: "file" | "paste";
    onContacts: (contacts: Contact[], source: string) => void;
  }

  let { disabled = false, mode = "file", onContacts }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let error = $state("");
  let pasted = $state("");

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

  function applyPasted() {
    const contacts = contactsFromMebisCsv(pasted) ?? contactsFromLines(pasted);
    error = contacts.length ? "" : $t("lms.paste.empty");
    if (contacts.length) onContacts(contacts, $t("lms.paste.source"));
  }
</script>

<div class="flex flex-col gap-1">
  <input bind:this={fileInput} type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden" onchange={picked} />
  {#if mode === "file"}
    <p class="m-0 text-sm text-muted">{$t("lms.file.hint")}</p>
    <div class="mt-1">
      <Button size="sm" icon={faFileCsv} {disabled} onClick={() => fileInput?.click()}>{$t("lms.file.pick")}</Button>
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      <Field label={$t("lms.paste.label")} hint={$t("lms.paste.hint")}>
        {#snippet children({ id })}
          <Textarea {id} rows={5} bind:value={pasted} placeholder={$t("lms.paste.placeholder")} {disabled} />
        {/snippet}
      </Field>
      <div>
        <Button size="sm" disabled={disabled || !pasted.trim()} onClick={applyPasted}>{$t("lms.paste.apply")}</Button>
      </div>
    </div>
  {/if}
  {#if error}<p class="m-0 text-sm text-danger-fg" role="alert">{error}</p>{/if}
</div>
