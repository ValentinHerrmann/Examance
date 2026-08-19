<script lang="ts">
  import { t } from "$lib/i18n";

  export let mode: 'loading' | 'locked';
</script>

{#if mode === 'loading'}
  <div class="rounded-xl border border-dashed border-slate-700 bg-slate-800 px-8 py-16 text-center">
    <p>{$t("dashboard.sessionState.initializing")}</p>
  </div>
{:else}
  <div class="rounded-xl border border-dashed border-slate-700 bg-slate-800 px-8 py-16 text-center">
    <h2 class="m-0 text-[1.75rem] text-slate-50">{$t("dashboard.sessionState.lockedTitle")}</h2>
    <p>{$t("dashboard.sessionState.lockedText")}</p>
    <a
      href="/unlock"
      class="rounded-md bg-sky-600 px-5 py-2.5 font-semibold text-white no-underline hover:bg-sky-700"
      >{$t("dashboard.sessionState.unlockButton")}</a
    >
  </div>
{/if}
