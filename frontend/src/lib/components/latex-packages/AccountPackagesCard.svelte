<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, Card, SaveStatus } from "#lib/components/ui";
  import { createAutosave } from "#lib/utils/autosave";
  import HelpButton from "#lib/components/help/HelpButton.svelte";
  import { entriesError, type LatexPackageEntry } from "#lib/latex/packages";
  import {
    fetchAccountPackages,
    getTemplatePackages,
    saveAccountPackages,
    type TemplatePackages,
  } from "#lib/latex/packageSettings";
  import PackageEntriesEditor from "./PackageEntriesEditor.svelte";
  import PackageResultView from "./PackageResultView.svelte";
  import TemplatePackagesTable from "./TemplatePackagesTable.svelte";

  /** The account's LaTeX packages (issue #108), added to every exam and exercise preview. Shows what the template loads, lets the teacher pass options to it, and previews the merged result. Saves itself once the list is valid (issue #232). */

  let template = $state.raw<TemplatePackages | null>(null);
  let saved = $state.raw<LatexPackageEntry[]>([]);
  let draft = $state.raw<LatexPackageEntry[]>([]);
  let loading = $state(true);
  let loadFailed = $state(false);
  let error = $state("");
  let editor: ReturnType<typeof PackageEntriesEditor> | undefined = $state();

  // Order is load order, so a reordered list counts as a change.
  let dirty = $derived(JSON.stringify(draft) !== JSON.stringify(saved));
  let invalid = $derived(entriesError(draft) !== null);
  let templateNames = $derived(new Set(template?.packages.map((p) => p.name) ?? []));
  let adjusted = $derived(new Set(draft.filter((e) => e.kind === "package" && e.options).map((e) => e.name)));

  // An invalid list stays unsaved; its error shows under the editor.
  async function save() {
    const sent = draft;
    if (entriesError(sent) !== null || JSON.stringify(sent) === JSON.stringify(saved)) return;
    const stored = await saveAccountPackages(sent);
    saved = stored;
    // Edits made during the save stay; the next save takes them.
    if (draft === sent) draft = stored;
  }

  const autosave = createAutosave({
    run: save,
    message: (err) => translate("latexPackages.account.saveFailed", { message: (err as Error)?.message ?? "" }),
  });
  onDestroy(() => autosave.dispose());

  onMount(async () => {
    const [account, templateResult] = await Promise.allSettled([fetchAccountPackages(), getTemplatePackages()]);
    if (account.status === "fulfilled") {
      saved = draft = account.value;
    } else {
      loadFailed = true;
      error = translate("latexPackages.account.loadFailed", { message: (account.reason as Error)?.message ?? "" });
    }
    if (templateResult.status === "fulfilled") template = templateResult.value;
    loading = false;
  });

  // Every edit schedules a save.
  $effect.pre(() => {
    const d = dirty;
    void draft;
    untrack(() => {
      if (d) autosave.schedule();
    });
  });
</script>

<div id="latex-packages" class="scroll-mt-16 lg:scroll-mt-4">
  <Card>
    <h2 class="m-0 mb-1 flex items-center gap-2 text-xl font-medium text-content">
      {$t("latexPackages.account.heading")}
      <HelpButton topic="exercises" size="sm" />
      <SaveStatus status={$autosave} class="ml-auto text-base font-normal" />
    </h2>
    <p class="mt-0 mb-4 text-sm text-muted">{$t("latexPackages.account.description")}</p>
    {#if error}
      <Alert severity="danger" class="mb-3" onDismiss={() => (error = "")}>{error}</Alert>
    {/if}

    {#if !loading && !loadFailed}
      <section class="flex min-w-0 flex-col gap-2">
        <h3 class="m-0 text-base font-medium text-content">{$t("latexPackages.account.own")}</h3>
        <PackageEntriesEditor
          bind:this={editor}
          bind:entries={draft}
          idPrefix="account-packages"
          {templateNames}
          emptyText={$t("latexPackages.account.empty")}
        />
        {#if invalid}
          <p class="m-0 text-xs text-danger-fg">{$t("latexPackages.account.invalid")}</p>
        {/if}
      </section>

      <details class="mt-4 min-w-0">
        <summary class="cursor-pointer text-base font-medium text-content">{$t("latexPackages.result.heading")}</summary>
        <div class="mt-2">
          <PackageResultView layers={[{ source: "account", entries: draft }]} />
        </div>
      </details>

      <section class="mt-4 flex min-w-0 flex-col gap-2">
        <h3 class="m-0 text-base font-medium text-content">{$t("latexPackages.template.heading")}</h3>
        <p class="m-0 text-sm text-muted">{$t("latexPackages.template.description")}</p>
        {#if template}
          <TemplatePackagesTable {template} {adjusted} onAdjust={(name) => editor?.focusOptions(name)} />
        {:else}
          <p class="m-0 text-sm text-muted">{$t("latexPackages.template.loadFailed")}</p>
        {/if}
      </section>
    {/if}
  </Card>
</div>
