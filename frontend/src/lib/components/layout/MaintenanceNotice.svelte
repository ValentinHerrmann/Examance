<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { faScrewdriverWrench, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Alert, Button, Icon, Modal, Spinner } from "#lib/components/ui";
  import { isUnlocked, sessionStore } from "#lib/stores/session";
  import {
    maintenancePhase,
    maintenanceStore,
    refreshMaintenance,
    secondsToStart,
    startMaintenancePolling,
  } from "#lib/stores/maintenanceStore";
  import { markReady } from "#lib/api/maintenance";
  import { maintenanceText } from "#lib/maintenance/text";

  // Issue #130: two reminders before downtime (the 2nd shows even if the 1st was closed), then a
  // blocking notice while it runs. Admins only get banners: they must stay able to end the window.
  const DISMISSED_KEY = "examance.maintenanceDismissed";
  const SAVED_KEY = "examance.maintenanceSaved";

  function readSet(key: string): string[] {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[]; } catch { return []; }
  }
  function writeSet(key: string, values: string[]) {
    try { sessionStorage.setItem(key, JSON.stringify(values.slice(-20))); } catch { /* storage may be blocked */ }
  }

  let dismissed = $state.raw<string[]>(readSet(DISMISSED_KEY));
  let saved = $state.raw<string[]>(readSet(SAVED_KEY));

  let status = $derived($maintenanceStore.status);
  let phase = $derived($maintenancePhase);
  let revision = $derived(status?.revision ?? 0);
  let signedIn = $derived($isUnlocked);
  let isAdmin = $derived(signedIn && $sessionStore.role === "admin");
  let teacher = $derived(signedIn && !isAdmin);
  let onUnlockPage = $derived(page.url.pathname === "/unlock");

  let reminderOpen = $derived(
    teacher && (phase === "warning" || phase === "final") && !dismissed.includes(`${revision}:${phase}`),
  );
  let overlayOpen = $derived(teacher && phase === "down");
  let hasSaved = $derived(saved.includes(String(revision)));

  let countdown = $derived($maintenanceText.countdown($secondsToStart));
  let vars = $derived({
    kind: $maintenanceText.kind(status),
    duration: $maintenanceText.duration(status),
    countdown,
    time: $maintenanceText.time(status?.starts_at ?? null),
    reminder: $maintenanceText.reminder(status),
  });

  function closeReminder() {
    dismissed = [...dismissed, `${revision}:${phase}`];
    writeSet(DISMISSED_KEY, dismissed);
  }

  async function confirmSaved() {
    const rev = revision;
    if (!saved.includes(String(rev))) {
      saved = [...saved, String(rev)];
      writeSet(SAVED_KEY, saved);
    }
    closeReminder();
    try { await markReady(rev); } catch { /* only feeds the admin's count */ }
  }

  function refreshOnFocus() {
    if (document.visibilityState === "visible") void refreshMaintenance();
  }

  onMount(() => startMaintenancePolling());
</script>

{#snippet savedAction()}
  <Button onClick={confirmSaved}>{$t("maintenance.savedButton")}</Button>
{/snippet}

<svelte:window onfocus={refreshOnFocus} />
<svelte:document onvisibilitychange={refreshOnFocus} />

{#if phase !== "none" && !(onUnlockPage && !signedIn)}
  {#if signedIn && phase === "scheduled"}
    <Alert severity="info" title={$t("maintenance.scheduledTitle", vars)} class="mx-3 mt-2 sm:mx-4">
      {$t("maintenance.scheduledBody", vars)}
    </Alert>
  {:else if signedIn && (phase === "warning" || phase === "final")}
    <Alert
      severity="warning"
      title={$t(phase === "final" ? "maintenance.finalTitle" : "maintenance.warningTitle", vars)}
      class="mx-3 mt-2 sm:mx-4"
      actions={teacher && !hasSaved ? savedAction : undefined}
    >
      {$t(phase === "final" ? "maintenance.finalBody" : "maintenance.warningBody", vars)}
    </Alert>
  {:else if isAdmin && phase === "down"}
    <Alert severity="warning" title={$t(status?.kind === "deployment" ? "maintenance.downTitle.deployment" : "maintenance.downTitle.manual")} class="mx-3 mt-2 sm:mx-4">
      {$t("maintenance.downBody", vars)}
    </Alert>
  {:else if !signedIn}
    <Alert severity="info" class="mx-3 mt-2 sm:mx-4">
      {#if phase === "scheduled"}
        {$t("maintenance.publicScheduled", vars)}
      {:else if phase === "down"}
        {$t("maintenance.publicDown", vars)}
      {:else}
        {$t("maintenance.publicNotice", vars)}
      {/if}
    </Alert>
  {/if}
{/if}

<Modal open={reminderOpen} size="small" closeOnBackdrop={false} closeOnEscape={false} role="alertdialog">
  <div class="text-center">
    <Icon icon={faFloppyDisk} class="mb-2 text-4xl text-warning-fg" />
    <h3 class="m-0 mb-3 text-xl text-warning-fg">
      {$t(phase === "final" ? "maintenance.finalTitle" : "maintenance.warningTitle", vars)}
    </h3>
    <p class="mb-6 text-base leading-normal text-muted">
      {$t(phase === "final" ? "maintenance.finalBody" : "maintenance.warningBody", vars)}
    </p>
    <div class="flex flex-col justify-center gap-2 sm:flex-row">
      <Button onClick={confirmSaved}>{$t("maintenance.savedButton")}</Button>
      <Button variant="outlined" onClick={closeReminder}>{$t("maintenance.close")}</Button>
    </div>
  </div>
</Modal>

<Modal open={overlayOpen} size="small" closeOnBackdrop={false} closeOnEscape={false} role="alertdialog">
  <div class="text-center">
    <Icon icon={faScrewdriverWrench} class="mb-2 text-4xl text-info-fg" />
    <h3 class="m-0 mb-3 text-xl text-content">
      {$t(status?.kind === "deployment" ? "maintenance.downTitle.deployment" : "maintenance.downTitle.manual")}
    </h3>
    <p class="mb-4 text-base leading-normal text-muted">{$t("maintenance.downBody", vars)}</p>
    {#if !$maintenanceStore.reachable}
      <p class="mb-4 text-sm text-subtle">{$t("maintenance.unreachable")}</p>
    {/if}
    <div class="flex justify-center"><Spinner /></div>
  </div>
</Modal>
