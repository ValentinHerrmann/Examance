<script lang="ts">
  // Maintenance mode for admins (issue #130): announce a window with a lead time (0 = now) and an expected duration, optionally back up the database when it starts, and see who is still online.
  import { onMount } from "svelte";
  import { apiErrorMessage } from "#lib/api/client";
  import {
    DOWNTIME_CLASSES,
    endMaintenance,
    getMaintenance,
    startMaintenance,
    startMaintenanceNow,
    type AdminMaintenance,
  } from "#lib/api/maintenance";
  import { maintenanceStore, refreshMaintenance, type DowntimeClass } from "#lib/stores/maintenanceStore";
  import { maintenanceText } from "#lib/maintenance/text";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, ConfirmDialog, Field, Select, Switch, TextInput } from "#lib/components/ui";

  let data = $state.raw<AdminMaintenance | null>(null);
  let error = $state("");
  let busy = $state(false);
  let now = $state(Date.now());

  let leadMinutes = $state("5");
  let downtimeClass = $state<string>("short");
  let backup = $state(true);
  let confirmStartNow = $state(false);

  let status = $derived(data?.status ?? null);
  let open = $derived(status !== null && status.phase !== "none");
  let leadValid = $derived(/^\d+$/.test(leadMinutes.trim()) && Number(leadMinutes) <= 1440);
  // Server-adjusted like the teachers' notices, so both show the same countdown.
  let secondsLeft = $derived(
    status?.starts_at
      ? Math.max(0, Math.ceil((Date.parse(status.starts_at) - (now + $maintenanceStore.offsetMs)) / 1000))
      : null,
  );

  function phaseLabel(phase: string): string {
    switch (phase) {
      case "scheduled": return $t("maintenance.admin.phase.scheduled");
      case "warning": return $t("maintenance.admin.phase.warning");
      case "final": return $t("maintenance.admin.phase.final");
      case "down": return $t("maintenance.admin.phase.down");
      default: return $t("maintenance.admin.phase.none");
    }
  }

  function backupLabel(d: AdminMaintenance): string {
    if (!d.backup_wanted) return $t("maintenance.admin.backup.none");
    switch (d.backup_state) {
      case "running": return $t("maintenance.admin.backup.running");
      case "done": return $t("maintenance.admin.backup.done", { file: d.backup_file ?? "" });
      case "failed": return $t("maintenance.admin.backup.failed");
      default: return $t("maintenance.admin.backup.pending");
    }
  }

  function offsiteLabel(state: AdminMaintenance["offsite_state"]): string | null {
    switch (state) {
      case "skipped": return $t("maintenance.admin.offsite.skipped");
      case "running": return $t("maintenance.admin.offsite.running");
      case "done": return $t("maintenance.admin.offsite.done");
      case "failed": return $t("maintenance.admin.offsite.failed");
      default: return null;
    }
  }

  const count = (n: number | null | undefined) => (n === null || n === undefined ? $t("maintenance.admin.unknown") : String(n));

  async function load() {
    try {
      data = await getMaintenance();
      error = "";
    } catch (err) {
      error = apiErrorMessage(err, translate("maintenance.admin.loadFailed"));
    }
  }

  async function act(failKey: "maintenance.admin.startFailed" | "maintenance.admin.endFailed" | "maintenance.admin.startNowFailed", action: () => Promise<AdminMaintenance>) {
    busy = true;
    error = "";
    try {
      data = await action();
      void refreshMaintenance();
    } catch (err) {
      error = apiErrorMessage(err, translate(failKey));
    } finally {
      busy = false;
    }
  }

  function start() {
    if (!leadValid) return;
    return act("maintenance.admin.startFailed", () =>
      startMaintenance({ lead_minutes: Number(leadMinutes), downtime_class: downtimeClass as DowntimeClass, backup }),
    );
  }

  function startNow() {
    confirmStartNow = false;
    const revision = status?.revision;
    if (revision == null) return;
    return act("maintenance.admin.startNowFailed", () => startMaintenanceNow(revision));
  }

  onMount(() => {
    void load();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  });
</script>

<div class="flex min-w-0 flex-col gap-5">
  {#if error}<Alert severity="danger">{error}</Alert>{/if}

  <section class="flex min-w-0 flex-col gap-2">
    <h3 class="m-0 text-base font-semibold text-content">{$t("maintenance.admin.countsTitle")}</h3>
    <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <span><strong class="text-lg">{count(data?.counts.online)}</strong> {$t("maintenance.admin.online")}</span>
      {#if open}
        <span><strong class="text-lg">{count(data?.counts.warned)}</strong> {$t("maintenance.admin.warned")}</span>
        <span><strong class="text-lg">{count(data?.counts.ready)}</strong> {$t("maintenance.admin.ready")}</span>
      {/if}
    </div>
    <p class="m-0 text-xs text-muted">{$t("maintenance.admin.countsHint")}</p>
  </section>

  <section class="flex min-w-0 flex-col gap-2">
    <h3 class="m-0 text-base font-semibold text-content">{$t("maintenance.admin.statusTitle")}</h3>
    {#if !open || !status || !data}
      <p class="m-0 text-sm text-muted">{$t("maintenance.admin.statusNone")}</p>
    {:else}
      <p class="m-0 text-sm">
        <strong>{status.kind === "deployment" ? $t("maintenance.admin.kind.deployment") : $t("maintenance.admin.kind.manual")}</strong>
        · {phaseLabel(status.phase)} · {$maintenanceText.duration(status)}
      </p>
      <p class="m-0 text-sm text-muted">
        {$t("maintenance.admin.startsAt", {
          time: $maintenanceText.time(status.starts_at),
          countdown: $maintenanceText.countdown(secondsLeft),
        })}
      </p>
      <p class="m-0 text-sm text-muted">{backupLabel(data)}</p>
      {#if offsiteLabel(data.offsite_state)}<p class="m-0 text-sm text-muted">{offsiteLabel(data.offsite_state)}</p>{/if}
      <div class="flex flex-wrap gap-2">
        {#if status.phase !== "down"}
          <Button variant="outlined" loading={busy} onClick={() => (confirmStartNow = true)}>{$t("maintenance.admin.startNow")}</Button>
        {/if}
        <Button severity="danger" variant="outlined" loading={busy} onClick={() => act("maintenance.admin.endFailed", endMaintenance)}>
          {$t("maintenance.admin.end")}
        </Button>
      </div>
      {#if status.phase !== "down"}<p class="m-0 text-xs text-muted">{$t("maintenance.admin.startNowHint")}</p>{/if}
    {/if}
  </section>

  <form class="flex min-w-0 flex-col gap-4 md:max-w-form" onsubmit={(e) => { e.preventDefault(); void start(); }}>
    <h3 class="m-0 text-base font-semibold text-content">{$t("maintenance.admin.startTitle")}</h3>
    <Field label={$t("maintenance.admin.leadLabel")} forId="maintenance-lead" hint={$t("maintenance.admin.leadHint")}>
      <TextInput id="maintenance-lead" type="number" min="0" max="1440" bind:value={leadMinutes} invalid={!leadValid} disabled={busy} />
    </Field>
    <Field
      label={$t("maintenance.admin.durationLabel")}
      forId="maintenance-duration"
      hint={$t("maintenance.admin.durationHint", { text: $maintenanceText.durationOf(downtimeClass as DowntimeClass) })}
    >
      <Select id="maintenance-duration" bind:value={downtimeClass} disabled={busy}>
        {#each DOWNTIME_CLASSES as c (c)}
          <option value={c}>{$maintenanceText.durationOf(c)}</option>
        {/each}
      </Select>
    </Field>
    <div class="flex flex-col gap-1">
      <Switch checked={backup} label={$t("maintenance.admin.backupLabel")} disabled={busy} onChange={(v) => (backup = v)} />
      <p class="m-0 text-xs text-muted">{$t("maintenance.admin.backupHint")}</p>
    </div>
    <div class="flex flex-col gap-1">
      <div><Button type="submit" loading={busy} disabled={!leadValid}>{$t("maintenance.admin.start")}</Button></div>
      {#if open}<p class="m-0 text-xs text-muted">{$t("maintenance.admin.replaceHint")}</p>{/if}
    </div>
  </form>
</div>

<ConfirmDialog
  open={confirmStartNow}
  title={$t("maintenance.admin.startNowTitle")}
  message={$t("maintenance.admin.startNowConfirm", { online: count(data?.counts.online), ready: count(data?.counts.ready) })}
  confirmText={$t("maintenance.admin.startNow")}
  cancelText={$t("common.cancel")}
  {busy}
  onConfirm={() => void startNow()}
  onCancel={() => (confirmStartNow = false)}
/>
