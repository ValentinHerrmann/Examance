<script lang="ts">
  import { t } from "$lib/i18n";

  export let isImporting: boolean;
  export let importStatus: string;
  export let onImportArchive: (event: Event) => void;
</script>

<div class="mb-6 flex flex-wrap items-start justify-between gap-3 lg:mb-8">
  <div class="min-w-0 flex-1">
    <h2 class="m-0 text-2xl break-words text-content lg:text-3xl">
      {$t("dashboard.header.title")}
    </h2>
    <p class="m-0 mt-1.5 text-sm text-muted">{$t("dashboard.header.subtitle")}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2 sm:gap-4">
    <label
      for="importFile"
      class="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-surface-inset px-4 py-2 text-sm font-semibold text-content hover:bg-line-strong sm:px-5"
    >
      {isImporting ? $t("dashboard.header.importing") : $t("dashboard.header.importButton")}
    </label>
    <input type="file" id="importFile" accept=".bgproj" on:change={onImportArchive} disabled={isImporting} hidden />
    <a
      href="/exam/new"
      class="inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast no-underline hover:bg-primary/90 sm:px-5"
      >{$t("dashboard.header.createButton")}</a
    >
  </div>
</div>

{#if importStatus}
  <div class="mb-6 rounded-md border border-primary bg-surface-base px-4 py-3 text-sm text-accent">
    {importStatus}
  </div>
{/if}
