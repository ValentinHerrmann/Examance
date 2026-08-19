<script lang="ts">
  import "./UploadPanel.css";
  import { t } from "$lib/i18n";
  export let isProcessing: boolean = false;
  export let progress: number = 0;
  export let statusText: string = "";
  export let onFileUpload: (event: Event) => void;
</script>

<div class="upload-box">
  <input
    type="file"
    id="scanFiles"
    multiple
    accept="application/pdf"
    on:change={onFileUpload}
    disabled={isProcessing}
  />
  <label for="scanFiles">{$t("scanning.uploadPanel.selectFiles")}</label>
</div>

{#if isProcessing}
  <div class="progress-section">
    <div class="progress-bar">
      <div class="upload-panel-fill" style="width: {progress}%"></div>
    </div>
    <p class="status">{statusText}</p>
  </div>
{:else if statusText}
  <p class="status-msg">{statusText}</p>
{/if}
