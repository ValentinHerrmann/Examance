<script lang="ts">
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
  <label for="scanFiles">Select Scan Files (PDF only)</label>
</div>

{#if isProcessing}
  <div class="progress-section">
    <div class="progress-bar">
      <div class="fill" style="width: {progress}%"></div>
    </div>
    <p class="status">{statusText}</p>
  </div>
{:else if statusText}
  <p class="status-msg">{statusText}</p>
{/if}

<style>
  .upload-box {
    background: #0f172a;
    border: 2px dashed #334155;
    padding: 3rem;
    text-align: center;
    border-radius: 12px;
  }

  input[type="file"] {
    display: none;
  }

  label {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: #0284c7;
    color: white;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
  }

  .progress-section {
    margin-top: 2rem;
  }

  .progress-bar {
    height: 12px;
    background: #1e293b;
    border-radius: 6px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: #38bdf8;
    transition: width 0.2s ease;
  }

  .status-msg {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: #94a3b8;
  }
</style>
