<script lang="ts">
  // Invite someone (issue #53): the account is created approved with the chosen features, the address
  // counts as verified, and a set-password link is mailed. The route performs the call.
  import { untrack } from "svelte";
  import { ALL_FEATURES_ON, type AccountFeatures } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { Button, Field, Select, TextInput } from "#lib/components/ui";
  import FeatureSwitches from "./FeatureSwitches.svelte";

  type UserRole = "teacher" | "admin";

  interface Props {
    busy: boolean;
    /** Resolves true when the invitation went out, which clears the form. */
    onInvite: (email: string, role: UserRole, features: AccountFeatures) => Promise<boolean>;
    /** Reports whether the form holds unsent input. */
    onDirty?: (dirty: boolean) => void;
  }

  let { busy, onInvite, onDirty }: Props = $props();

  let email = $state("");
  let role: UserRole = $state("teacher");
  let features = $state<AccountFeatures>({ ...ALL_FEATURES_ON });

  async function submit() {
    if (await onInvite(email.trim(), role, $state.snapshot(features))) {
      email = "";
      role = "teacher";
      features = { ...ALL_FEATURES_ON };
    }
  }

  $effect.pre(() => {
    const dirty = email.trim() !== "";
    untrack(() => onDirty?.(dirty));
  });
</script>

<form class="flex flex-col gap-4" onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <Field label={$t("admin.users.emailLabel")} forId="invite-email">
    <TextInput
      id="invite-email"
      type="email"
      bind:value={email}
      placeholder={$t("admin.users.emailPlaceholder")}
      autocomplete="off"
      required
      disabled={busy}
    />
  </Field>

  <Field label={$t("admin.users.roleLabel")} forId="invite-role" hint={$t("admin.users.adminHint")}>
    <Select id="invite-role" bind:value={role} disabled={busy}>
      <option value="teacher">{$t("admin.users.roleTeacher")}</option>
      <option value="admin">{$t("admin.users.roleAdmin")}</option>
    </Select>
  </Field>

  <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
    <legend class="mb-2 p-0 text-sm font-medium text-content">{$t("admin.features.heading")}</legend>
    <FeatureSwitches
      {features}
      disabled={busy}
      onChange={(key, value) => (features = { ...features, [key]: value })}
    />
  </fieldset>

  <div>
    <Button type="submit" loading={busy} class="w-full sm:w-auto">
      {busy ? $t("admin.invite.sending") : $t("admin.invite.submit")}
    </Button>
  </div>
</form>
