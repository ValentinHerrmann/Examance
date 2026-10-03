<script lang="ts">
  import { t } from "$lib/i18n";

  export let mode: 'loading' | 'locked';
</script>

{#if mode === 'loading'}
  <div class="rounded-xl border border-dashed border-line bg-surface-raised px-8 py-16 text-center">
    <p>{$t("dashboard.sessionState.initializing")}</p>
  </div>
{:else}
  <div class="rounded-xl border border-dashed border-line bg-surface-raised px-8 py-16 text-center">
    <h2 class="m-0 text-3xl text-content">{$t("dashboard.sessionState.lockedTitle")}</h2>
    <p>{$t("dashboard.sessionState.lockedText")}</p>
    <a
      href="/unlock"
      class="rounded-md bg-primary px-5 py-2.5 font-semibold text-primary-contrast no-underline hover:bg-primary"
      >{$t("dashboard.sessionState.unlockButton")}</a
    >
  </div>
{/if}
