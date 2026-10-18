<script lang="ts">
  import { onMount } from "svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, Badge, Radio, Switch } from "#lib/components/ui";
  import { exerciseEntries, type LatexPackageEntry, type PackageLayer } from "#lib/latex/packages";
  import { fetchAccountPackages } from "#lib/latex/packageSettings";
  import PackageEntriesEditor from "./PackageEntriesEditor.svelte";
  import PackageResultView from "./PackageResultView.svelte";

  /**
   * An exam's LaTeX packages (issue #108): follow the account, or add packages and leave out account ones for this
   * exam. Nothing is written here; the exam page saves `packages` with the other exam data.
   */
  interface Props {
    /** Null follows the account; otherwise additions plus `disabled` entries for left-out account packages. */
    packages: LatexPackageEntry[] | null;
    /** The exam's exercises, so the result shows what they load and where they clash. */
    exerciseSources: { label: string; latex: string }[];
  }

  let { packages = $bindable(), exerciseSources }: Props = $props();

  let account = $state.raw<LatexPackageEntry[]>([]);
  let loading = $state(true);
  let error = $state("");

  let custom = $derived(packages !== null);
  let additions = $derived((packages ?? []).filter((e) => !e.disabled));
  let omitted = $derived(new Set((packages ?? []).filter((e) => e.disabled).map((e) => `${e.kind}:${e.name}`)));

  let exerciseLayers = $derived(
    exerciseSources.map(({ label, latex }): PackageLayer => ({ source: "exercise", label, entries: exerciseEntries(latex) }))
  );
  let exerciseNames = $derived([
    ...new Set(exerciseLayers.flatMap((layer) => layer.entries.map((e) => e.name))),
  ]);
  let layers = $derived<PackageLayer[]>([
    { source: "account", entries: account },
    ...exerciseLayers,
    { source: "exam", entries: packages ?? [] },
  ]);

  function write(nextAdditions: LatexPackageEntry[], nextOmitted: ReadonlySet<string>) {
    const left = account
      .filter((e) => nextOmitted.has(`${e.kind}:${e.name}`))
      .map((e): LatexPackageEntry => ({ kind: e.kind, name: e.name, options: "", disabled: true }));
    packages = [...nextAdditions, ...left];
  }

  function setOmitted(entry: LatexPackageEntry, omit: boolean) {
    const next = new Set(omitted);
    const key = `${entry.kind}:${entry.name}`;
    if (omit) next.add(key);
    else next.delete(key);
    write(additions, next);
  }

  onMount(async () => {
    try {
      account = await fetchAccountPackages();
    } catch (err) {
      error = translate("latexPackages.exam.loadFailed", { message: (err as Error)?.message ?? "" });
    } finally {
      loading = false;
    }
  });
</script>

<fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={loading}>
  <legend class="mb-1 p-0 text-sm font-medium text-content">{$t("latexPackages.exam.heading")}</legend>
  {#if error}
    <Alert severity="danger" onDismiss={() => (error = "")}>{error}</Alert>
  {/if}

  <div class="flex flex-col gap-2">
    <Radio
      name="examPackageMode"
      value="account"
      group={custom ? "custom" : "account"}
      onchange={() => (packages = null)}
      label={$t("latexPackages.exam.account")}
    />
    <Radio
      name="examPackageMode"
      value="custom"
      group={custom ? "custom" : "account"}
      onchange={() => (packages = packages ?? [])}
      label={$t("latexPackages.exam.custom")}
    />
  </div>

  <div class="ml-7 flex min-w-0 flex-col gap-3">
    <div class="flex min-w-0 flex-col gap-1">
      <p class="m-0 text-xs font-medium text-muted">{$t("latexPackages.exam.inherited")}</p>
      {#if account.length === 0}
        <p class="m-0 text-xs text-muted">{$t("latexPackages.exam.noAccountPackages")}</p>
      {:else if custom}
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          {#each account as entry (`${entry.kind}:${entry.name}`)}
            {@const isOmitted = omitted.has(`${entry.kind}:${entry.name}`)}
            <li class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="min-w-0 break-words font-mono text-sm {isOmitted ? 'text-muted line-through' : 'text-content'}">
                {entry.name}{entry.options ? `[${entry.options}]` : ""}
              </span>
              <Switch
                checked={isOmitted}
                label={$t("latexPackages.exam.omit", { name: entry.name })}
                onChange={(checked) => setOmitted(entry, checked)}
              />
            </li>
          {/each}
        </ul>
      {:else}
        <div class="flex flex-wrap gap-1">
          {#each account as entry (`${entry.kind}:${entry.name}`)}
            <Badge size="xs">{entry.name}{entry.options ? `[${entry.options}]` : ""}</Badge>
          {/each}
        </div>
      {/if}
      <a href="/settings#latex-packages" class="link text-xs">{$t("latexPackages.exam.toSettings")}</a>
    </div>

    {#if custom}
      <div class="flex min-w-0 flex-col gap-1">
        <p class="m-0 text-xs font-medium text-muted">{$t("latexPackages.exam.additions")}</p>
        <PackageEntriesEditor
          entries={additions}
          onEntriesChange={(next) => write(next, omitted)}
          idPrefix="exam-packages"
        />
      </div>
    {/if}

    {#if exerciseNames.length}
      <p class="m-0 text-xs text-muted">{$t("latexPackages.exam.exercises", { names: exerciseNames.join(", ") })}</p>
    {/if}

    <details class="min-w-0">
      <summary class="cursor-pointer text-sm text-content">{$t("latexPackages.result.heading")}</summary>
      <div class="mt-2"><PackageResultView {layers} /></div>
    </details>
  </div>
</fieldset>
