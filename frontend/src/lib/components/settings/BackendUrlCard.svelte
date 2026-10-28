<script lang="ts">
  // Which backend this browser talks to: the sign-in request and the session cookies go there.
  import { get } from "svelte/store";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, Card } from "#lib/components/ui";
  import BackendUrlInput from "#lib/components/common/BackendUrlInput.svelte";
  import { backendStore, effectiveBackendStore } from "#lib/stores/backendStore";

  let value = $state(get(backendStore));
  let status = $state<{ ok: boolean; text: string } | null>(null);

  function save() {
    const trimmed = value.trim();
    if (!trimmed) {
      status = { ok: false, text: translate("settings.backend.empty") };
      return;
    }
    try {
      backendStore.saveSuccessfulBackendUrl(trimmed);
    } catch (err) {
      // Never swallowed: this value decides where session cookies and the login request are sent.
      status = { ok: false, text: err instanceof Error ? err.message : translate("settings.backend.invalid") };
      return;
    }
    status = { ok: true, text: translate("settings.backend.updated", { url: get(effectiveBackendStore) }) };
  }
</script>

<div id="backend" class="scroll-mt-16 lg:scroll-mt-4">
  <Card>
    <h2 class="m-0 mb-1 text-xl font-medium text-content">{$t("settings.backend.heading")}</h2>
    <p class="mt-0 mb-4 text-sm text-muted">{$t("settings.backend.description")}</p>
    {#if status}
      <Alert severity={status.ok ? "success" : "danger"} class="mb-3">{status.text}</Alert>
    {/if}
    <div class="flex items-center gap-2">
      <BackendUrlInput bind:value placeholder="localhost:8000" class="flex-1" />
      <Button onClick={save}>{$t("common.save")}</Button>
    </div>
  </Card>
</div>
