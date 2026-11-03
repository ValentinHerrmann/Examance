<script lang="ts">
  /** Shares graded PDFs with students through personal encrypted links and prints the slips (issue #207, docs/dev/result_sharing.md). Options that do not fit the chosen students are muted with the reason. */
  import { onMount } from "svelte";
  import { faCircleInfo, faShareFromSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Alert, Badge, Button, Checkbox, ConfirmDialog, Field, Icon, Modal, Radio, Select, Spinner, TableScroller } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { revokeAllResultShares, revokeResultShare } from "#lib/api/resultShares";
  import { channelUnavailable, incompatibleStudents, sendsPdf as channelSendsPdf, SHARE_CHANNELS, SHARE_FACTORS, type ArtemisMode, type ShareChannelId } from "#lib/sharing/channels";
  import type { ArtemisCourse } from "#lib/api/integrations";
  import { featuresStore } from "#lib/stores/capabilities";
  import DeliveryPreview from "./DeliveryPreview.svelte";
  import DeliverySetup from "./DeliverySetup.svelte";
  import type { ShareFactor } from "#lib/sharing/shareCrypto";
  import {
    DEFAULT_EXPIRY_DAYS,
    loadShareOverview,
    SHARE_EXPIRY_DAYS,
    shareResults,
    type ShareOutcome,
    type ShareOverview,
    type ShareStudent,
  } from "#lib/sharing/shareService";
  import { resultsAreLocal } from "#lib/stores/storagePolicy";
  import { formatDate } from "#lib/utils/format";

  interface Props {
    examId: string;
    onClose: () => void;
    /** Opens the sticker dialog for printing key slips only. */
    onPrintKeys?: () => void;
  }

  let { examId, onClose, onPrintKeys }: Props = $props();

  let overview = $state.raw<ShareOverview | null>(null);
  let selected = $state.raw<Set<string>>(new Set());
  let channel = $state<ShareChannelId>("slips");
  let factor = $state<ShareFactor>("none");
  let expiry = $state(String(DEFAULT_EXPIRY_DAYS));
  let includeSolution = $state(false);
  let loading = $state(true);
  let running = $state(false);
  let step = $state("");
  let error = $state("");
  let outcome = $state.raw<ShareOutcome | null>(null);
  let confirmRevokeAll = $state(false);
  let artemisCourse = $state.raw<ArtemisCourse | null>(null);
  let artemisMode = $state<ArtemisMode>("link");
  let previewing = $state(false);
  let revoking = $state(false);

  const progressClass =
    "block h-3 w-full appearance-none overflow-hidden rounded-md bg-surface-inset [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-inset [&::-webkit-progress-value]:bg-primary";
  const STATE_BADGE = { complete: "success", partial: "warning", ungraded: "secondary" } as const;
  const DONE = { slips: "sharing.share.done", email: "sharing.channels.email.done", artemis: "sharing.channels.artemis.done", mebis: "sharing.channels.mebis.done" } as const;

  // Every channel is listed; one the account or server cannot use is greyed out with its reason.
  let unavailable = $derived(new Map(SHARE_CHANNELS.map((c) => [c.id, channelUnavailable(c, $featuresStore)])));
  let currentChannel = $derived(SHARE_CHANNELS.find((c) => c.id === channel && !unavailable.get(c.id)) ?? SHARE_CHANNELS[0]);
  // Artemis PDF mode makes no link, so neither a factor nor the solution applies.
  let sendsPdf = $derived(channelSendsPdf(currentChannel.id, artemisMode));
  let setupMissing = $derived(currentChannel.id === "artemis" && !artemisCourse);
  let chosenStudents = $derived(overview?.students.filter((s) => selected.has(s.key)).map((s) => s.student) ?? []);
  let blockedCount = (f: ShareFactor) => incompatibleStudents(f, currentChannel, chosenStudents).length;
  let factorMuted = (f: ShareFactor) => !currentChannel.factors.includes(f) || (chosenStudents.length > 0 && blockedCount(f) === chosenStudents.length);

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
  let activeShares = $derived((overview?.students.filter((s) => s.share).length ?? 0) + (overview?.orphans.length ?? 0));

  async function reload() {
    loading = true;
    try {
      overview = await loadShareOverview(examId);
      if (!selected.size) selected = new Set(overview.students.filter((s) => s.hasSubmission && s.state !== "ungraded").map((s) => s.key));
    } catch (err) {
      error = `${$t("sharing.errors.load")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      loading = false;
    }
  }

  onMount(reload);

  function toggle(student: ShareStudent, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(student.key);
    else next.delete(student.key);
    selected = next;
  }

  function selectGraded() {
    selected = new Set(overview?.students.filter((s) => s.hasSubmission && s.state !== "ungraded").map((s) => s.key) ?? []);
  }

  function stateLabel(s: ShareStudent): string {
    return s.hasSubmission ? $t(`sharing.share.state.${s.state}`) : $t("sharing.share.state.noSubmission");
  }

  async function start() {
    previewing = false;
    running = true;
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
        },
        (phase, done = 0, total = 0) =>
          (step = phase === "solution" ? $t("sharing.share.compilingSolution") : $t("sharing.share.running", { done: done + 1, total }))
      );
      saveDownload(outcome);
      await reload();
    } catch (err) {
      error = `${$t("sharing.errors.share")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      running = false;
      step = "";
    }
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
</script>

<Modal open={true} size="large" title={$t("sharing.share.title")} onClose={running ? undefined : onClose} closeOnEscape={!running} {error}>
  <div class="flex flex-col gap-5">
    <p class="text-sm text-muted">{$t("sharing.share.intro")}</p>
    {#if resultsAreLocal()}
      <Alert severity="info">{$t("sharing.share.hybridNote")}</Alert>
    {/if}

    {#if outcome}
      <Alert severity={outcome.warnings.length ? "warning" : "success"} title={$t(DONE[outcome.channel], { count: outcome.shared })}>
        {#if outcome.warnings.length}
          <p>{$t("sharing.share.doneWithWarnings")}</p>
          <ul class="list-disc pl-5">
            {#each outcome.warnings as warning}<li>{warning}</li>{/each}
          </ul>
        {/if}
        {#snippet actions()}
          {#if outcome?.download}
            <Button size="sm" variant="outlined" severity="secondary" onClick={() => outcome && saveDownload(outcome)}>
              {$t("sharing.share.downloadAgain")}
            </Button>
          {/if}
        {/snippet}
      </Alert>
    {/if}

    {#if loading && !overview}
      <div class="flex items-center gap-2 text-sm text-muted"><Spinner />{$t("sharing.share.loading")}</div>
    {:else if overview}
      <section class="flex min-w-0 flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">{$t("sharing.share.students")} ({selected.size}/{overview.students.length})</h3>
          <div class="flex gap-2">
            <Button size="sm" variant="text" disabled={running} onClick={selectGraded}>{$t("sharing.share.selectGraded")}</Button>
            <Button size="sm" variant="text" disabled={running} onClick={() => (selected = new Set())}>{$t("sharing.share.selectNone")}</Button>
          </div>
        </div>
        <TableScroller maxHeight="max-h-72">
          <table class="data-table data-table-compact w-full">
            <tbody>
              {#each overview.students as s (s.key)}
                <tr>
                  <td class="w-8">
                    <Checkbox
                      checked={selected.has(s.key)}
                      onChange={(on) => toggle(s, on)}
                      disabled={running || !s.hasSubmission}
                      aria-label={s.name}
                    />
                  </td>
                  <td class="min-w-0">{s.name}</td>
                  <td><Badge size="xs" severity={s.hasSubmission ? STATE_BADGE[s.state] : "secondary"}>{stateLabel(s)}</Badge></td>
                  <td class="text-sm text-muted">
                    {#if s.share}{$t("sharing.share.sharedUntil", { date: formatDate(s.share.expiresAt) })}{/if}
                  </td>
                  <td class="text-right">
                    {#if s.share}
                      <Button size="sm" variant="text" severity="danger" disabled={running} onClick={() => s.share && revoke(s.share.id)}>
                        {$t("sharing.share.revoke")}
                      </Button>
                    {/if}
                  </td>
                </tr>
              {/each}
              {#each overview.orphans as orphan (orphan.id)}
                <tr>
                  <td></td>
                  <td class="text-muted italic">{$t("sharing.share.removedStudent")}</td>
                  <td></td>
                  <td class="text-sm text-muted">{$t("sharing.share.sharedUntil", { date: formatDate(orphan.expiresAt) })}</td>
                  <td class="text-right">
                    <Button size="sm" variant="text" severity="danger" disabled={running} onClick={() => revoke(orphan.id)}>{$t("sharing.share.revoke")}</Button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </TableScroller>
      </section>

      <fieldset class="flex flex-col gap-2" disabled={running}>
        <legend class="mb-2 text-sm text-muted">{$t("sharing.share.channel")}</legend>
        {#each SHARE_CHANNELS as c (c.id)}
          {@const reason = unavailable.get(c.id)}
          <div class={reason ? "opacity-60" : ""}>
            <Radio group={currentChannel.id} value={c.id} name="share-channel" disabled={!!reason} onchange={() => chooseChannel(c.id)} label={$t(c.labelKey)} />
            <p class="ml-7 text-sm text-muted">{$t(c.descriptionKey)}</p>
            {#if reason}
              <p class="ml-7 flex items-start gap-1.5 text-sm text-muted"><Icon icon={faCircleInfo} class="mt-0.5 shrink-0" />{$t(reason)}</p>
            {/if}
          </div>
          {#if c.id === currentChannel.id && (c.id === "email" || c.id === "artemis")}
            <DeliverySetup channel={c.id} students={overview.students} disabled={running} bind:artemisCourse bind:artemisMode onSaved={reload} />
          {/if}
        {/each}
      </fieldset>

      {#if !sendsPdf}
      <fieldset class="flex flex-col gap-2" disabled={running}>
        <legend class="mb-2 text-sm text-muted">{$t("sharing.share.factor")}</legend>
        {#each SHARE_FACTORS as f (f)}
          <div class={factorMuted(f) ? "opacity-60" : ""}>
            <Radio group={factor} value={f} name="share-factor" disabled={factorMuted(f)} onchange={() => (factor = f)} label={$t(`sharing.factor.${f}`)} />
            <p class="ml-7 text-sm text-muted">{$t(`sharing.factor.${f}Hint`)}</p>
            {#if f === "sticker" && chosenStudents.length > 0 && blockedCount(f) > 0}
              <p class="ml-7 flex flex-wrap items-center gap-2 text-sm text-warning-fg">
                {factorMuted(f) ? $t("sharing.factor.noStickerAny") : $t("sharing.factor.someNoSticker", { count: blockedCount(f) })}
                {#if onPrintKeys}
                  <Button size="sm" variant="text" onClick={onPrintKeys}>{$t("sharing.factor.printKeys")}</Button>
                {/if}
              </p>
            {/if}
          </div>
        {/each}
      </fieldset>

      <div>
        <Checkbox
          bind:checked={includeSolution}
          label={$t("sharing.share.includeSolution")}
          disabled={running || !overview.solutionAvailable}
        />
        <p class="ml-7 text-sm text-muted">
          {overview.solutionAvailable ? $t("sharing.share.includeSolutionHint") : $t("sharing.share.solutionWithheld")}
        </p>
      </div>
      {/if}

      <Field label={$t("sharing.share.expiry")} hint={$t("sharing.share.replaceNote")}>
        {#snippet children({ id })}
          <Select {id} bind:value={expiry} disabled={running}>
            {#each SHARE_EXPIRY_DAYS as days (days)}
              <option value={String(days)}>{$t("sharing.share.days", { count: days })}</option>
            {/each}
          </Select>
        {/snippet}
      </Field>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <span class="text-sm text-muted">{$t("sharing.share.active")}: {activeShares || $t("sharing.share.activeNone")}</span>
        {#if activeShares}
          <Button size="sm" variant="outlined" severity="danger" icon={faTrash} disabled={running} onClick={() => (confirmRevokeAll = true)}>
            {$t("sharing.share.revokeAll")}
          </Button>
        {/if}
      </div>
    {/if}

    {#if running}
      <div aria-live="polite">
        <progress class={progressClass} aria-label={step}></progress>
        <p class="mt-2 text-sm text-muted">{step}</p>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" disabled={running} onClick={onClose}>{$t("common.close")}</Button>
    <Button
      icon={faShareFromSquare}
      loading={running}
      disabled={running || loading || !selected.size || setupMissing || (!sendsPdf && factorMuted(factor))}
      onClick={run}
    >
      {currentChannel.id === "slips" ? $t("sharing.share.run") : currentChannel.id === "mebis" ? $t("sharing.channels.mebis.run") : $t("sharing.share.runDelivery")}
    </Button>
  {/snippet}
</Modal>

{#if previewing && overview}
  <DeliveryPreview
    channel={currentChannel}
    students={overview.students.filter((s) => selected.has(s.key))}
    {factor}
    artemis={artemisCourse ? { ...artemisCourse, mode: artemisMode } : null}
    onConfirm={start}
    onCancel={() => (previewing = false)}
  />
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
