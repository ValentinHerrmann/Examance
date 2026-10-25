<script lang="ts">
  import { updated } from "$app/state";
  import { t } from "#lib/i18n";
  import { Alert, Button } from "#lib/components/ui";
  import { frontendVersion, frontendVersionUrl, repoUrl } from "#lib/stores/versionStore";
  import { maintenancePhase } from "#lib/stores/maintenanceStore";
  import { parseReleaseNotes, type Inline } from "#lib/utils/releaseNotes";

  // Last version this browser/installed app has shown; an installed (PWA) app can stay open for days.
  const SEEN_KEY = "examance.lastSeenVersion";
  const isRelease = !frontendVersion.includes("-");
  // TEMPORARY (issue #94): previews always show the deployed PR's title (deploy-preview.yml writes it as the notes) so the
  // visuals can be reviewed; remove before merging.
  const isPreview = /PR#\d+/.test(frontendVersion);

  const blocks = parseReleaseNotes(__RELEASE_NOTES__, new URL(repoUrl).origin);

  let showNotes = $state(false);
  let dismissedUpdate = $state(false);
  // Issue #148: the new frontend may be live before the backend is; offer the reload only once the window is over.
  const maintenanceBusy = $derived($maintenancePhase === "warning" || $maintenancePhase === "final" || $maintenancePhase === "down");

  function readSeen(): string | null {
    try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
  }
  function writeSeen(v: string) {
    try { localStorage.setItem(SEEN_KEY, v); } catch { /* storage may be blocked */ }
  }

  $effect(() => {
    if (isPreview) { showNotes = blocks.length > 0; return; }
    if (!isRelease) return;
    // A missing marker also counts as "not seen yet": browsers that last ran a build without this feature (or no
    // release build at all) have none, and releases published while the app was closed must still be announced.
    const seen = readSeen();
    writeSeen(frontendVersion);
    if (seen !== frontendVersion && blocks.length > 0) showNotes = true;
  });
</script>

{#snippet inlines(items: Inline[])}
  {#each items as i}
    {#if i.kind === "bold"}<strong>{i.text}</strong>
    {:else if i.kind === "code"}<code class="rounded-md bg-surface-sunken px-1">{i.text}</code>
    {:else if i.kind === "link"}<a class="text-accent underline" href={i.href} target="_blank" rel="noopener noreferrer">{i.text}</a>
    {:else}{i.text}{/if}
  {/each}
{/snippet}

{#if updated.current && !dismissedUpdate && !maintenanceBusy}
  <Alert severity="info" title={$t("statusBar.updateTitle")} class="mx-3 mt-2 sm:mx-4" onDismiss={() => (dismissedUpdate = true)}>
    {$t("statusBar.updateBody")}
    {#snippet actions()}
      <Button onClick={() => location.reload()}>{$t("statusBar.updateReload")}</Button>
    {/snippet}
  </Alert>
{/if}

{#if showNotes}
  <Alert severity="success" title={$t("statusBar.releaseNotesTitle", { version: frontendVersion })} class="mx-3 mt-2 sm:mx-4" onDismiss={() => (showNotes = false)}>
    <div class="max-h-64 space-y-2 overflow-auto text-sm">
      {#each blocks as b}
        {#if b.kind === "heading"}
          <h3 class="mt-1 font-semibold">{@render inlines(b.inlines)}</h3>
        {:else if b.kind === "list"}
          <ul class="list-disc space-y-1 pl-5">
            {#each b.items as item}<li class="break-words">{@render inlines(item)}</li>{/each}
          </ul>
        {:else}
          <p class="break-words">{@render inlines(b.inlines)}</p>
        {/if}
      {/each}
    </div>
    <a class="mt-2 inline-block text-accent underline" href={isPreview ? (frontendVersionUrl ?? repoUrl) : `${repoUrl}/releases/tag/v${frontendVersion}`} target="_blank" rel="noopener noreferrer">{isPreview ? $t("statusBar.linkPullRequest") : $t("statusBar.releaseNotesLink")}</a>
  </Alert>
{/if}
