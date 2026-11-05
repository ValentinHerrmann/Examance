<script lang="ts" module>
  /** A backup can start once a password is set and repeated identically. */
  export const backupReady = (password: string, repeat: string) => !!password && password === repeat;
</script>

<script lang="ts">
  import { t } from "#lib/i18n";
  import { Checkbox, Field, TextInput } from "#lib/components/ui";

  /** The password-protected, re-importable backup's inputs (password, repeat, without exercise texts), shared by the export dialog and the Results Archive tab. */
  interface Props {
    password: string;
    passwordRepeat: string;
    withoutCode: boolean;
    disabled?: boolean;
    /** Show the short explanation above the fields. */
    intro?: boolean;
    class?: string;
  }

  let { password = $bindable(""), passwordRepeat = $bindable(""), withoutCode = $bindable(false), disabled = false, intro = true, class: className = "" }: Props = $props();

  let mismatch = $derived(passwordRepeat !== "" && password !== passwordRepeat);
</script>

<div class="flex flex-col gap-4 {className}">
  {#if intro}<p class="m-0 text-sm text-muted">{$t("export.backup.intro")}</p>{/if}
  <Field label={$t("export.backup.password")} hint={$t("export.backup.passwordHint")}>
    {#snippet children({ id })}
      <TextInput {id} type="password" autocomplete="new-password" bind:value={password} {disabled} />
    {/snippet}
  </Field>
  <Field label={$t("export.backup.passwordRepeat")} error={mismatch ? $t("export.backup.mismatch") : undefined}>
    {#snippet children({ id })}
      <TextInput {id} type="password" autocomplete="new-password" bind:value={passwordRepeat} invalid={mismatch} {disabled} />
    {/snippet}
  </Field>
  <div>
    <Checkbox bind:checked={withoutCode} label={$t("export.backup.withoutCode")} {disabled} />
    <p class="mt-0 mb-0 ml-7 text-sm text-muted">{$t("export.backup.withoutCodeHint")}</p>
  </div>
</div>
