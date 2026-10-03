<script lang="ts">
  import { t } from "$lib/i18n";
  import { Alert, Button, PageHeader } from "$lib/components/ui";

  export let isImporting: boolean;
  export let importStatus: string;
  export let onImportArchive: (event: Event) => void;

  let fileInput: HTMLInputElement;
</script>

<PageHeader title={$t("dashboard.header.title")} subtitle={$t("dashboard.header.subtitle")}>
  <svelte:fragment slot="actions">
    <Button variant="outlined" severity="secondary" disabled={isImporting} onClick={() => fileInput.click()}>
      {isImporting ? $t("dashboard.header.importing") : $t("dashboard.header.importButton")}
    </Button>
    <input
      bind:this={fileInput}
      type="file"
      id="importFile"
      accept=".bgproj"
      on:change={onImportArchive}
      disabled={isImporting}
      hidden
    />
    <Button href="/exam/new">{$t("dashboard.header.createButton")}</Button>
  </svelte:fragment>
</PageHeader>

{#if importStatus}
  <Alert class="mb-6">{importStatus}</Alert>
{/if}
