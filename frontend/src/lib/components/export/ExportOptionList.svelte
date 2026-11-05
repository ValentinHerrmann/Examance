<script lang="ts">
  import { t } from "#lib/i18n";
  import { Checkbox } from "#lib/components/ui";
  import type { ExportOption } from "./ExportOptionsModal.svelte";

  /** The checkbox list of a raw export (modal and the Archive tab share it); `checked` maps option keys to their state. */
  interface Props {
    options: ExportOption[];
    checked: Record<string, boolean>;
    disabled?: boolean;
  }

  let { options, checked = $bindable(), disabled = false }: Props = $props();
</script>

<fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" {disabled}>
  <legend class="mb-2 p-0 text-sm text-muted">{$t("export.dialog.chooseParts")}</legend>
  {#each options as option (option.key)}
    <div>
      <Checkbox bind:checked={checked[option.key]} label={option.label} disabled={option.disabled || disabled} />
      {#if option.hint}<p class="ml-7 text-sm text-muted">{option.hint}</p>{/if}
    </div>
  {/each}
</fieldset>
