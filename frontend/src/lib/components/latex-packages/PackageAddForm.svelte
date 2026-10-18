<script lang="ts">
  import { faPlus } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button, Select, TextInput } from "#lib/components/ui";
  import { PACKAGE_KINDS, entryError, type LatexPackageEntry, type PackageKind } from "#lib/latex/packages";
  import { entryErrorText } from "#lib/latex/packageMessages";

  /** Adds one package or library (issue #108); `isDuplicate` lets the caller refuse names it already has. */
  interface Props {
    onAdd: (entry: LatexPackageEntry) => void;
    isDuplicate: (entry: LatexPackageEntry) => boolean;
  }

  let { onAdd, isDuplicate }: Props = $props();

  let kind = $state<PackageKind>("package");
  let name = $state("");
  let options = $state("");
  let error = $state("");

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const entry: LatexPackageEntry = { kind, name: name.trim(), options: kind === "package" ? options.trim() : "" };
    const problem = entryError(entry.kind, entry.name, entry.options) ?? (isDuplicate(entry) ? "duplicate" : null);
    if (problem) {
      error = entryErrorText($t, problem, entry.name);
      return;
    }
    onAdd(entry);
    name = "";
    options = "";
    error = "";
  }
</script>

<form class="flex min-w-0 flex-col gap-1" onsubmit={submit}>
  <div class="flex min-w-0 flex-wrap items-end gap-2">
    <Select size="sm" class="w-auto" bind:value={kind} aria-label={$t("latexPackages.field.kind")}>
      {#each PACKAGE_KINDS as option (option)}
        <option value={option}>{$t(`latexPackages.kind.${option}`)}</option>
      {/each}
    </Select>
    <TextInput
      size="sm"
      class="min-w-0 flex-1 basis-32 font-mono"
      bind:value={name}
      placeholder={$t("latexPackages.field.namePlaceholder")}
      aria-label={$t("latexPackages.field.name")}
      invalid={Boolean(error)}
    />
    <TextInput
      size="sm"
      class="min-w-0 flex-[2] basis-40 font-mono"
      bind:value={options}
      disabled={kind !== "package"}
      placeholder={kind === "package" ? $t("latexPackages.field.optionsPlaceholder") : $t("latexPackages.field.noOptions")}
      aria-label={$t("latexPackages.field.options")}
    />
    <Button type="submit" size="sm" variant="outlined" icon={faPlus} disabled={!name.trim()}>
      {$t("latexPackages.add")}
    </Button>
  </div>
  {#if error}
    <p class="m-0 text-xs text-danger-fg">{error}</p>
  {/if}
</form>
