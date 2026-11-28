<script lang="ts">
  // "Drawn pages / Exact PDF" in the exercise editor's preview header (issue #352): remembered per account (also in Settings), drawn pages by default; only while the browser engine compiles.
  import { t } from "#lib/i18n";
  import { capabilitiesStore, effectiveLatexStore, savePreviewDrawnPages } from "#lib/stores/capabilities";

  let drawn = $derived($capabilitiesStore?.previewDrawnPages ?? true);
  let saving = $state(false);

  async function choose(value: boolean) {
    if (value === drawn || saving) return;
    saving = true;
    try {
      await savePreviewDrawnPages(value);
    } catch (err) {
      console.warn("Could not save the preview mode", err);
    } finally {
      saving = false;
    }
  }

  const option =
    "cursor-pointer rounded-sm border-0 px-1.5 py-0.5 text-xs font-medium transition-colors pointer-coarse:min-h-11 disabled:cursor-default";
</script>

{#if $effectiveLatexStore === "local"}
<div class="flex items-center gap-0.5 rounded-md bg-surface-inset p-0.5" role="radiogroup" aria-label={$t("exercises.editor.previewModeLabel")} title={$t("exercises.editor.previewDrawnHint")}>
  {#each [{ value: true, label: $t("exercises.editor.previewDrawn") }, { value: false, label: $t("exercises.editor.previewExact") }] as o (o.label)}
    <button
      type="button"
      role="radio"
      aria-checked={drawn === o.value}
      disabled={saving}
      class="{option} {drawn === o.value ? 'bg-surface-raised text-content shadow-sm' : 'bg-transparent text-muted hover:text-content'}"
      onclick={() => choose(o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>
{/if}
