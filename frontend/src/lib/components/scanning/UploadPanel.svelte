<script lang="ts">
  import { t } from "$lib/i18n";
  import { faFileArrowUp } from "@fortawesome/free-solid-svg-icons";
  import { Icon } from "$lib/components/ui";
  import InfoTip from "$lib/components/help/InfoTip.svelte";
  interface Props {
    isProcessing?: boolean;
    progress?: number;
    statusText?: string;
    onFileUpload: (event: Event) => void;
  }

  let {
    isProcessing = false,
    progress = 0,
    statusText = "",
    onFileUpload
  }: Props = $props();
</script>

<div class="rounded-xl border-2 border-dashed border-line-strong bg-surface-raised p-6 text-center sm:p-12">
  <input
    type="file"
    id="scanFiles"
    multiple
    accept="application/pdf"
    onchange={onFileUpload}
    disabled={isProcessing}
    class="peer sr-only"
  />
  <label
    for="scanFiles"
    class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-transparent bg-primary px-4 py-2 font-normal text-primary-contrast peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:cursor-not-allowed peer-disabled:opacity-60 pointer-coarse:min-h-11"
  >
    <Icon icon={faFileArrowUp} />
    {$t("scanning.uploadPanel.selectFiles")}
  </label>
  <InfoTip class="ml-2 align-middle" text={$t("help.tips.pseudonymQr")} topic="scanning" />
</div>

{#if isProcessing}
  <div class="mt-8">
    <div
      class="h-3 overflow-hidden rounded-md bg-surface-inset"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(progress)}
    >
      <div class="h-full bg-primary transition-[width] duration-200" style="width: {progress}%"></div>
    </div>
    <p class="mt-2 text-sm text-muted">{statusText}</p>
  </div>
{:else if statusText}
  <p class="mt-4 text-sm text-muted">{statusText}</p>
{/if}
