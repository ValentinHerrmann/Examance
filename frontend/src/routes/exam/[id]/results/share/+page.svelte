<script lang="ts">
  // Share results with students (issues #207, #212, docs/dev/result_sharing.md): a guided page in four numbered steps, then the delivery status and the active links. Options that do not fit the chosen students are muted with the reason.
  import { page } from "$app/state";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { t } from "#lib/i18n";
  import type { Locale } from "#lib/i18n/types";
  import { Alert, Button, Card, ConfirmDialog, PageShell, Spinner, actionIcons } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { closeResultDeliveries, revokeAllResultShares, revokeResultShare } from "#lib/api/resultShares";
  import type { ArtemisCourse } from "#lib/api/integrations";
  import { watchBounces } from "#lib/sharing/delivery";
  import { channelUnavailable, incompatibleStudents, sendsPdf as channelSendsPdf, SHARE_CHANNELS, type ArtemisMode, type ShareChannelId } from "#lib/sharing/channels";
  import type { ShareFactor } from "#lib/sharing/shareCrypto";
  import {
    DEFAULT_EXPIRY_DAYS,
    loadShareOverview,
    latestDeliveries,
    shareResults,
    undelivered,
    type ShareOutcome,
    type SharePhase,
    type ShareOverview,
  } from "#lib/sharing/shareService";
  import { featuresStore } from "#lib/stores/capabilities";
  import { resultsAreLocal } from "#lib/stores/storagePolicy";
  import { awaitSessionReady } from "#lib/stores/session";
  import DeliveryPreview from "#lib/components/sharing/DeliveryPreview.svelte";
  import ShareStudents from "#lib/components/sharing/ShareStudents.svelte";
  import ShareChannel from "#lib/components/sharing/ShareChannel.svelte";
  import ShareOptions from "#lib/components/sharing/ShareOptions.svelte";
  import StickerSheetDialog from "#lib/components/sharing/StickerSheetDialog.svelte";

  let examId = $derived(page.params.id || "");

  let overview = $state.raw<ShareOverview | null>(null);
  let selected = $state.raw<Set<string>>(new Set());
  let channel = $state<ShareChannelId>("slips");
  let factor = $state<ShareFactor>("none");
  let expiry = $state(String(DEFAULT_EXPIRY_DAYS));
  let includeSolution = $state(false);
  // Students are addressed in German unless the teacher picks otherwise; the UI language does not decide it.
  let language = $state<Locale>("de");
  let includeCode = $state(false);
  let loading = $state(true);
  let running = $state(false);
  // Sending a class can take minutes: phase and count drive a filling bar and an "x of y" label.
  let progress = $state<{ phase: SharePhase; done: number; total: number } | null>(null);
  let error = $state("");
  let outcome = $state.raw<ShareOutcome | null>(null);
  let confirmRevokeAll = $state(false);
  let artemisCourse = $state.raw<ArtemisCourse | null>(null);
  let artemisMode = $state<ArtemisMode>("link");
  let previewing = $state(false);
  let revoking = $state(false);
  // Key slips print on top of this page, so its state (selection, channel, Artemis token) survives (issue #212).
  let printingKeys = $state(false);
  // After an e-mail run the page waits for returned mails (issue #221); later ones are mailed to the teacher.
  let waiting = $state<{ secondsLeft: number } | null>(null);
  let waitAbort: AbortController | null = null;

  const progressClass =
    "block h-3 w-full appearance-none overflow-hidden rounded-md bg-surface-inset [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-inset [&::-webkit-progress-value]:bg-primary";
  const DONE = { slips: "sharing.share.done", email: "sharing.channels.email.done", artemis: "sharing.channels.artemis.done", mebis: "sharing.channels.mebis.done" } as const;

  // Every channel is listed; one the account or server cannot use is greyed out with its reason.
  let unavailable = $derived(new Map(SHARE_CHANNELS.map((c) => [c.id, channelUnavailable(c, $featuresStore)])));
  let currentChannel = $derived(SHARE_CHANNELS.find((c) => c.id === channel && !unavailable.get(c.id)) ?? SHARE_CHANNELS[0]);
  // Artemis PDF mode makes no link, so neither a factor nor the solution applies.
  let sendsPdf = $derived(channelSendsPdf(currentChannel.id, artemisMode));
  // E-mail and Artemis write a message to each student; slips and the Mebis ZIP do not.
  let sendsMessage = $derived(currentChannel.id === "email" || currentChannel.id === "artemis");
  let setupMissing = $derived(currentChannel.id === "artemis" && !artemisCourse);
  let chosenStudents = $derived(overview?.students.filter((s) => selected.has(s.key)).map((s) => s.student) ?? []);
  let blockedCount = (f: ShareFactor) => incompatibleStudents(f, currentChannel, chosenStudents).length;
  let factorMuted = (f: ShareFactor) => !currentChannel.factors.includes(f) || (chosenStudents.length > 0 && blockedCount(f) === chosenStudents.length);
  let undeliveredCount = $derived(overview?.students.filter((s) => undelivered(s.delivery)).length ?? 0);
  let activeShares = $derived((overview?.students.filter((s) => s.share).length ?? 0) + (overview?.orphans.length ?? 0));
  let canRun = $derived(!running && !waiting && !loading && selected.size > 0 && !setupMissing && (sendsPdf || !factorMuted(factor)));

  function chooseChannel(id: ShareChannelId) {
    channel = id;
    const next = SHARE_CHANNELS.find((c) => c.id === id);
    // Channels through a third party never carry a link that opens alone; a PDF channel has no factor to pick.
    if (next?.factors.length && !next.factors.includes(factor)) factor = next.factors.find((f) => !factorMuted(f)) ?? next.factors[0];
  }

  function run() {
    // Slips and the Mebis ZIP stay with the teacher, so there is nothing to preview before sending.
    if (currentChannel.id === "slips" || currentChannel.id === "mebis") start();
    else previewing = true;
  }

  const gradedKeys = (o: ShareOverview) => new Set(o.students.filter((s) => s.hasSubmission && s.state !== "ungraded").map((s) => s.key));

  async function reload() {
    loading = true;
    try {
      await awaitSessionReady();
      overview = await loadShareOverview(examId);
      if (!selected.size) selected = gradedKeys(overview);
    } catch (err) {
      error = `${$t("sharing.errors.load")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      loading = false;
    }
  }

  function selectUndelivered() {
    selected = new Set(overview?.students.filter((s) => s.hasSubmission && undelivered(s.delivery)).map((s) => s.key) ?? []);
  }

  /** Shows returned mails live while the server watches (30 s), reading the mailbox every few seconds. */
  async function waitForBounces() {
    if (!overview || !$featuresStore.result_bounces) return;
    waitAbort = new AbortController();
    waiting = { secondsLeft: 0 };
    window.addEventListener("beforeunload", keepOpen);
    try {
      await watchBounces(
        examId,
        overview.deliveries,
        (deliveries, secondsLeft) => {
          waiting = { secondsLeft };
          if (overview) {
            const byKey = latestDeliveries(deliveries);
            overview = { ...overview, deliveries, students: overview.students.map((s) => ({ ...s, delivery: byKey.get(s.key) ?? s.delivery })) };
          }
        },
        waitAbort.signal
      );
    } finally {
      waiting = null;
      waitAbort = null;
      window.removeEventListener("beforeunload", keepOpen);
    }
  }

  /** Leaving mid-wait hands later bounces to the teacher's inbox. */
  function stopWaiting() {
    if (!waitAbort) return;
    waitAbort.abort();
    closeResultDeliveries(examId).catch((err) => console.warn("Could not end the bounce window:", err));
  }

  onDestroy(stopWaiting);

  async function start() {
    previewing = false;
    running = true;
    // Closing the tab mid-run would leave some students unserved.
    window.addEventListener("beforeunload", keepOpen);
    error = "";
    outcome = null;
    try {
      outcome = await shareResults(
        {
          examId,
          channel: currentChannel.id,
          factor,
          expiryDays: Number(expiry),
          studentKeys: selected,
          includeSolution: includeSolution && !sendsPdf && !!overview?.solutionAvailable,
          artemis: currentChannel.id === "artemis" && artemisCourse ? { ...artemisCourse, mode: artemisMode } : undefined,
          language,
          includeCode: sendsMessage && !sendsPdf && factor !== "none" && includeCode,
        },
        (phase, done = 0, total = 0) => (progress = { phase, done, total })
      );
      saveDownload(outcome);
      await reload();
      if (outcome.channel === "email") void waitForBounces();
    } catch (err) {
      error = `${$t("sharing.errors.share")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      running = false;
      progress = null;
      window.removeEventListener("beforeunload", keepOpen);
    }
  }

  function keepOpen(event: BeforeUnloadEvent) {
    event.preventDefault();
  }

  function progressLabel(p: { phase: SharePhase; done: number; total: number }): string {
    if (p.phase === "solution") return $t("sharing.share.progress.solution");
    const vars = { done: p.done, total: p.total };
    if (p.phase === "packing") return $t("sharing.share.progress.packing", vars);
    if (p.phase === "sending") return currentChannel.id === "email" ? $t("sharing.share.progress.sendingEmail", vars) : $t("sharing.share.progress.sendingArtemis", vars);
    return currentChannel.id === "email" ? $t("sharing.share.progress.preparing", vars) : $t("sharing.share.progress.encrypting", vars);
  }

  function saveDownload(result: ShareOutcome) {
    if (result.download) downloadBlob(new Blob([result.download.bytes as BlobPart], { type: result.download.type }), result.download.fileName);
  }

  async function revoke(shareId: string) {
    error = "";
    try {
      await revokeResultShare(examId, shareId);
      await reload();
    } catch (err) {
      error = `${$t("sharing.errors.revoke")} ${err instanceof Error ? err.message : ""}`.trim();
    }
  }

  async function revokeAll() {
    revoking = true;
    error = "";
    try {
      await revokeAllResultShares(examId);
      confirmRevokeAll = false;
      await reload();
    } catch (err) {
      error = `${$t("sharing.errors.revoke")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      revoking = false;
    }
  }

  let runLabel = $derived(
    currentChannel.id === "slips" ? $t("sharing.share.run") : currentChannel.id === "mebis" ? $t("sharing.channels.mebis.run") : $t("sharing.share.runDelivery"),
  );

  $effect.pre(() => {
    const id = examId;
    if (browser && id) untrack(() => void reload());
  });
</script>

{#snippet step(n: number, title: string)}
  <span class="inline-flex items-center gap-2">
    <span class="inline-flex size-6 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-on-highlight tabular-nums">{n}</span>
    {title}
  </span>
{/snippet}

<PageShell width="fluid">
  <ExamPageHeader {examId} step="results" title={$t("sharing.share.title")} hint={$t("sharing.share.intro")} helpTopic="stats" />

  <div class="flex min-w-0 flex-col gap-6">
    {#if resultsAreLocal()}
      <Alert severity="info">{$t("sharing.share.hybridNote")}</Alert>
    {/if}
    {#if error}<Alert severity="danger">{error}</Alert>{/if}

    {#if outcome}
      <Alert severity={outcome.warnings.length ? "warning" : "success"} title={$t(DONE[outcome.channel], { count: outcome.shared })}>
        {#if outcome.warnings.length}
          <p>{$t("sharing.share.doneWithWarnings")}</p>
          <ul class="list-disc pl-5">
            {#each outcome.warnings as warning}<li>{warning}</li>{/each}
          </ul>
        {/if}
        {#if outcome.channel === "email" && !$featuresStore.result_bounces}
          <p class="text-sm">{$t("sharing.delivery.notMonitored")}</p>
        {/if}
        {#snippet actions()}
          {#if outcome?.download}
            <Button size="sm" variant="outlined" severity="secondary" icon={actionIcons.download} onClick={() => outcome && saveDownload(outcome)}>
              {$t("sharing.share.downloadAgain")}
            </Button>
          {/if}
        {/snippet}
      </Alert>
    {/if}

    {#if waiting}
      <div aria-live="polite" class="flex flex-col gap-2">
        <progress class={progressClass} aria-label={$t("sharing.delivery.waiting")}></progress>
        <p class="m-0 flex flex-wrap justify-between gap-2 text-sm">
          <span>{$t("sharing.delivery.waiting")}</span>
          {#if waiting.secondsLeft}<span class="tabular-nums text-muted">{$t("sharing.delivery.secondsLeft", { count: waiting.secondsLeft })}</span>{/if}
        </p>
        <p class="m-0 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          {$t("sharing.delivery.closeHint")}
          <Button size="sm" variant="text" onClick={stopWaiting}>{$t("sharing.delivery.stopWaiting")}</Button>
        </p>
      </div>
    {/if}

    {#if undeliveredCount && !running}
      <Alert severity="warning" title={$t("sharing.delivery.undelivered", { count: undeliveredCount })}>
        <p>{$t("sharing.delivery.undeliveredHint")}</p>
        {#snippet actions()}
          <Button size="sm" variant="outlined" severity="secondary" disabled={!!waiting} onClick={selectUndelivered}>{$t("sharing.delivery.selectUndelivered")}</Button>
        {/snippet}
      </Alert>
    {/if}

    {#if loading && !overview}
      <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.share.loading")}</div>
    {:else if overview}
      <!-- From xl the student list is on the left, channel, options and send on the right. -->
      <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
        <div class="min-w-0">
      <Card>
        <h2 class="mt-0 mb-4 text-base font-semibold">{@render step(1, $t("sharing.share.students"))}</h2>
        <ShareStudents
          {overview}
          {selected}
          {running}
          onSelect={(next) => (selected = next)}
          onSelectGraded={() => overview && (selected = gradedKeys(overview))}
          onRevoke={revoke}
        />
      </Card>

        </div>
        <div class="flex min-w-0 flex-col gap-6">
      <Card>
        <h2 class="mt-0 mb-4 text-base font-semibold">{@render step(2, $t("sharing.share.channel"))}</h2>
        <ShareChannel
          {examId}
          students={overview.students}
          channel={currentChannel.id}
          {unavailable}
          {running}
          {sendsMessage}
          onChoose={chooseChannel}
          bind:artemisCourse
          bind:artemisMode
          bind:language
        />
      </Card>

      <Card>
        <h2 class="mt-0 mb-4 text-base font-semibold">{@render step(3, $t("sharing.page.options"))}</h2>
        <ShareOptions
          {running}
          {sendsPdf}
          {sendsMessage}
          solutionAvailable={overview.solutionAvailable}
          {blockedCount}
          {factorMuted}
          chosenCount={chosenStudents.length}
          onPrintKeys={() => (printingKeys = true)}
          bind:factor
          bind:includeCode
          bind:includeSolution
          bind:expiry
        />
      </Card>

      <!-- Step 4 stays in view while scrolling through the steps above. -->
      <div class="sticky bottom-0 z-[1] rounded-xl xl:static border border-line bg-surface-raised p-4 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="m-0 text-base font-semibold">{@render step(4, $t("sharing.page.send"))}</h2>
          <Button icon={sendsMessage ? actionIcons.send : actionIcons.share} loading={running} disabled={!canRun} onClick={run}>
            {runLabel} ({selected.size})
          </Button>
        </div>
        {#if running}
          {@const label = progress ? progressLabel(progress) : ""}
          {@const known = progress && progress.phase !== "solution" && progress.total > 0}
          <div aria-live="polite" class="mt-3">
            {#if known && progress}
              <progress class={progressClass} value={progress.done} max={progress.total} aria-label={label}></progress>
            {:else}
              <progress class={progressClass} aria-label={label}></progress>
            {/if}
            <p class="mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <span>{label}</span>
              {#if known && progress}<span class="tabular-nums text-muted">{Math.round((progress.done / progress.total) * 100)} %</span>{/if}
            </p>
            <p class="m-0 text-sm text-muted">{$t("sharing.share.progress.keepOpen")}</p>
          </div>
        {/if}
      </div>

        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <span class="text-sm text-muted">{$t("sharing.share.active")}: {activeShares || $t("sharing.share.activeNone")}</span>
        {#if activeShares}
          <Button size="sm" variant="outlined" severity="danger" icon={actionIcons.delete} disabled={running} onClick={() => (confirmRevokeAll = true)}>
            {$t("sharing.share.revokeAll")}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</PageShell>

{#if previewing && overview}
  <DeliveryPreview
    channel={currentChannel}
    students={overview.students.filter((s) => selected.has(s.key))}
    {factor}
    {language}
    includeCode={includeCode && factor !== "none" && !sendsPdf}
    artemis={artemisCourse ? { ...artemisCourse, mode: artemisMode } : null}
    onConfirm={start}
    onCancel={() => (previewing = false)}
  />
{/if}

{#if printingKeys}
  <StickerSheetDialog {examId} keysOnly onClose={() => (printingKeys = false)} />
{/if}

<ConfirmDialog
  open={confirmRevokeAll}
  title={$t("sharing.share.revokeAll")}
  message={$t("sharing.share.revokeAllConfirm", { count: activeShares })}
  confirmText={$t("sharing.share.revoke")}
  cancelText={$t("common.cancel")}
  severity="danger"
  role="alertdialog"
  busy={revoking}
  onConfirm={revokeAll}
  onCancel={() => (confirmRevokeAll = false)}
/>
