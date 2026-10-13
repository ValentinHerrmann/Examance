<script lang="ts">
  import { updated } from "$app/state";
  import { t } from "#lib/i18n";
  import { Alert, Button } from "#lib/components/ui";
  import { frontendVersion, repoUrl } from "#lib/stores/versionStore";

  // Last version this browser/installed app has shown; an installed (PWA) app can stay open for days.
  const SEEN_KEY = "examance.lastSeenVersion";
  const isRelease = !frontendVersion.includes("-");

  let notes = $state<string | null>(null);
  let showNotes = $state(false);
  let dismissedUpdate = $state(false);

  function readSeen(): string | null {
    try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
  }
  function writeSeen(v: string) {
    try { localStorage.setItem(SEEN_KEY, v); } catch { /* storage may be blocked */ }
  }

  $effect(() => {
    if (!isRelease) return;
    const seen = readSeen();
    writeSeen(frontendVersion);
    if (!seen || seen === frontendVersion) return;
    // Plain text only: the body is rendered as text, never as HTML.
    fetch(`https://api.github.com/repos/${repoUrl.replace("https://github.com/", "")}/releases/tags/v${frontendVersion}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { body?: unknown } | null) => {
        notes = typeof j?.body === "string" ? j.body.trim() : "";
        showNotes = true;
      })
      .catch(() => { notes = ""; showNotes = true; });
  });
</script>

{#if updated.current && !dismissedUpdate}
  <Alert severity="info" title={$t("statusBar.updateTitle")} class="mx-3 mt-2 sm:mx-4" onDismiss={() => (dismissedUpdate = true)}>
    {$t("statusBar.updateBody")}
    {#snippet actions()}
      <Button onClick={() => location.reload()}>{$t("statusBar.updateReload")}</Button>
    {/snippet}
  </Alert>
{/if}

{#if showNotes}
  <Alert severity="success" title={$t("statusBar.releaseNotesTitle", { version: frontendVersion })} class="mx-3 mt-2 sm:mx-4" onDismiss={() => (showNotes = false)}>
    {#if notes}<pre class="max-h-48 overflow-auto whitespace-pre-wrap text-sm">{notes}</pre>{/if}
    <a class="underline" href={`${repoUrl}/releases/tag/v${frontendVersion}`} target="_blank" rel="noopener noreferrer">{$t("statusBar.releaseNotesLink")}</a>
  </Alert>
{/if}
