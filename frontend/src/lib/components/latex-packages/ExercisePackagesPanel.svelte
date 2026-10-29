<script lang="ts">
  import { faChevronDown, faChevronUp, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Badge, Button, Icon, TextInput } from "#lib/components/ui";
  import {
    addPackageLine,
    entryError,
    exerciseEntries,
    packageLines,
    resolvePackages,
    updatePackageLine,
    type LatexPackageEntry,
  } from "#lib/latex/packages";
  import { getAccountPackages } from "#lib/latex/packageSettings";
  import { entryErrorText, isWarning } from "#lib/latex/packageMessages";
  import PackageAddForm from "./PackageAddForm.svelte";
  import PackageNotes from "./PackageNotes.svelte";

  /** The packages an exercise loads (issue #108). They stay `\usepackage` lines in its LaTeX, so they travel with sharing, versions and exports; this panel only reads and rewrites those lines. Commands mixed into other code are listed read-only. */
  interface Props {
    latex: string;
    name: string;
  }

  let { latex = $bindable(), name }: Props = $props();

  let open = $state(false);
  let account = $state.raw<LatexPackageEntry[] | null>(null);
  let optionErrors = $state.raw<Record<string, string>>({});

  type Row = LatexPackageEntry & { line: number | null };
  let editable = $derived<Row[]>(
    packageLines(latex).flatMap((line) =>
      line.commands.flatMap((command) =>
        command.names.map((n) => ({ kind: command.kind, name: n, options: command.options, line: line.line }))
      )
    )
  );
  let all = $derived(exerciseEntries(latex));
  let rows = $derived<Row[]>([
    ...editable,
    ...all
      .filter((e) => !editable.some((r) => r.kind === e.kind && r.name === e.name && r.options === e.options))
      .map((e) => ({ ...e, line: null })),
  ]);
  let notes = $derived(resolvePackages([{ source: "exercise", entries: all, label: name }]).notes);
  const rowKey = (row: Row) => `${row.kind}:${row.name}:${row.line ?? "code"}`;

  function setOptions(row: Row, options: string) {
    const trimmed = options.trim();
    const error = entryError(row.kind, row.name, trimmed);
    if (error) {
      optionErrors = { ...optionErrors, [rowKey(row)]: entryErrorText($t, error, row.name) };
      return;
    }
    optionErrors = { ...optionErrors, [rowKey(row)]: "" };
    if (row.line !== null && trimmed !== row.options) {
      latex = updatePackageLine(latex, row.line, row.kind, row.name, { kind: row.kind, name: row.name, options: trimmed });
    }
  }

  function remove(row: Row) {
    if (row.line !== null) latex = updatePackageLine(latex, row.line, row.kind, row.name, null);
  }

  async function toggle() {
    open = !open;
    if (open && account === null) account = await getAccountPackages();
  }
</script>

<div class="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2">
  <button type="button" class="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} onclick={toggle}>
    <span class="flex items-center gap-2">
      <span class="text-sm font-semibold text-content">{$t("latexPackages.exercise.heading")}</span>
      <Badge size="xs">{rows.length}</Badge>
      {#if notes.some(isWarning)}
        <Icon icon={faTriangleExclamation} class="text-warning-fg" />
      {/if}
    </span>
    <Icon icon={open ? faChevronUp : faChevronDown} class="text-muted" />
    <span class="sr-only">{open ? $t("latexPackages.exercise.hide") : $t("latexPackages.exercise.show")}</span>
  </button>

  {#if open}
    <p class="m-0 text-xs text-muted">{$t("latexPackages.exercise.description")}</p>
    {#if rows.length}
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        {#each rows as row (rowKey(row))}
          <li class="flex min-w-0 flex-col gap-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <Badge size="xs">{$t(`latexPackages.kind.${row.kind}`)}</Badge>
              <span class="font-mono text-sm text-content">{row.name}</span>
              {#if row.line === null}
                <span class="font-mono text-xs text-muted">{row.options ? `[${row.options}]` : ""}</span>
                <span class="text-xs text-muted">{$t("latexPackages.exercise.inCode")}</span>
              {:else}
                {#if row.kind === "package"}
                  <TextInput
                    size="sm"
                    class="min-w-0 flex-1 basis-40 font-mono"
                    value={row.options}
                    placeholder={$t("latexPackages.field.optionsPlaceholder")}
                    aria-label={$t("latexPackages.field.options")}
                    invalid={Boolean(optionErrors[rowKey(row)])}
                    onchange={(e) => setOptions(row, e.currentTarget.value)}
                  />
                {/if}
                <Button
                  iconOnly
                  size="sm"
                  variant="text"
                  severity="secondary"
                  icon={faTrash}
                  ariaLabel={$t("latexPackages.removeNamed", { name: row.name })}
                  onClick={() => remove(row)}
                />
              {/if}
            </div>
            {#if optionErrors[rowKey(row)]}
              <p class="m-0 text-xs text-danger-fg">{optionErrors[rowKey(row)]}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="m-0 text-sm text-muted">{$t("latexPackages.exercise.empty")}</p>
    {/if}

    <PackageNotes {notes} size="xs" />

    <PackageAddForm
      onAdd={(entry) => (latex = addPackageLine(latex, entry))}
      isDuplicate={(entry) => all.some((e) => e.kind === entry.kind && e.name === entry.name)}
    />

    {#if account?.length}
      <p class="m-0 text-xs text-muted">
        {$t("latexPackages.exercise.account")}
        <span class="font-mono">{account.map((e) => e.name).join(", ")}</span>
        · <a href="/settings#latex-packages" class="link">{$t("latexPackages.exercise.toSettings")}</a>
      </p>
    {:else if account}
      <p class="m-0 text-xs text-muted">
        <a href="/settings#latex-packages" class="link">{$t("latexPackages.exercise.toSettings")}</a>
      </p>
    {/if}
  {/if}
</div>
