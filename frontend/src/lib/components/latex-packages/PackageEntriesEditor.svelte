<script lang="ts">
  import { tick } from "svelte";
  import { faTrash } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Badge, Button, TextInput } from "#lib/components/ui";
  import { entryError, type LatexPackageEntry } from "#lib/latex/packages";
  import { entryErrorText } from "#lib/latex/packageMessages";
  import PackageAddForm from "./PackageAddForm.svelte";

  /** An editable level of package entries (issue #108). Records are replaced, never mutated, so the bound list stays a plain array for the API. Each row shows its own error; callers block saving with `entriesError`. */
  interface Props {
    entries: LatexPackageEntry[];
    idPrefix: string;
    /** Names the template loads itself: such a row only adds options. */
    templateNames?: ReadonlySet<string>;
    /** Shown instead of the list while it is empty. */
    emptyText?: string;
    /** Called with the new list after each change, for callers that derive `entries` instead of binding it. */
    onEntriesChange?: (entries: LatexPackageEntry[]) => void;
  }

  let { entries = $bindable(), idPrefix, templateNames = new Set(), emptyText = "", onEntriesChange }: Props = $props();

  function commit(next: LatexPackageEntry[]) {
    entries = next;
    onEntriesChange?.(next);
  }

  const sameKey = (a: LatexPackageEntry, b: LatexPackageEntry) => a.kind === b.kind && a.name === b.name;

  function rowError(entry: LatexPackageEntry, index: number): string {
    const error = entryError(entry.kind, entry.name, entry.options);
    if (error) return entryErrorText($t, error, entry.name);
    return entries.findIndex((e) => sameKey(e, entry)) !== index ? entryErrorText($t, "duplicate", entry.name) : "";
  }

  function update(index: number, patch: Partial<LatexPackageEntry>) {
    commit(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  }

  function remove(index: number) {
    commit(entries.filter((_, i) => i !== index));
  }

  /** Puts the cursor into the options of package `name`, adding it first (the template table's "add options"). */
  export async function focusOptions(name: string) {
    let index = entries.findIndex((e) => e.kind === "package" && e.name === name);
    if (index < 0) {
      commit([...entries, { kind: "package", name, options: "" }]);
      index = entries.length - 1;
    }
    await tick();
    const input = document.getElementById(`${idPrefix}-options-${index}`) as HTMLInputElement | null;
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus();
  }
</script>

<div class="flex min-w-0 flex-col gap-3">
  {#if entries.length}
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      {#each entries as entry, index (index)}
        {@const error = rowError(entry, index)}
        <li class="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-surface p-2">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <Badge size="xs">{$t(`latexPackages.kind.${entry.kind}`)}</Badge>
            <TextInput
              size="sm"
              class="min-w-0 flex-1 basis-32 font-mono"
              value={entry.name}
              aria-label={$t("latexPackages.field.name")}
              invalid={Boolean(error)}
              oninput={(e) => update(index, { name: e.currentTarget.value.trim() })}
            />
            {#if entry.kind === "package"}
              <TextInput
                id={`${idPrefix}-options-${index}`}
                size="sm"
                class="min-w-0 flex-[2] basis-40 font-mono"
                value={entry.options}
                placeholder={$t("latexPackages.field.optionsPlaceholder")}
                aria-label={$t("latexPackages.field.options")}
                oninput={(e) => update(index, { options: e.currentTarget.value })}
              />
              {#if templateNames.has(entry.name)}
                <Badge size="xs" severity="info" title={$t("latexPackages.templatePackage")}>
                  {$t("latexPackages.templateBadge")}
                </Badge>
              {/if}
            {/if}
            <Button
              iconOnly
              size="sm"
              variant="text"
              severity="secondary"
              icon={faTrash}
              ariaLabel={$t("latexPackages.removeNamed", { name: entry.name || "?" })}
              onClick={() => remove(index)}
            />
          </div>
          {#if error}
            <p class="m-0 text-xs text-danger-fg">{error}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if emptyText}
    <p class="m-0 text-sm text-muted">{emptyText}</p>
  {/if}

  <PackageAddForm onAdd={(entry) => commit([...entries, entry])} isDuplicate={(entry) => entries.some((e) => sameKey(e, entry))} />
</div>
