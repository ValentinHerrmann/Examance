<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { httpErrorStore } from "$lib/stores/httpErrorStore";
  import { t, translate } from "$lib/i18n";

  $: status = $page.status || 404;
  $: message = $page.error?.message || translate("dashboard.error.notFound");

  $: if (typeof window !== "undefined" && status) {
    httpErrorStore.showError(status, message);
  }

  onMount(() => {
    httpErrorStore.showError(status, message);
  });
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
  <div class="max-w-md rounded-xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
    <h2 class="mb-3 text-2xl font-bold text-slate-100">
      {$t("dashboard.error.title", { status })}
    </h2>
    <p class="mb-6 text-slate-300">
      {message}
    </p>
    <div class="flex justify-center gap-3">
      <button
        class="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        on:click={() => goto("/")}
      >
        {$t("dashboard.error.returnButton")}
      </button>
    </div>
  </div>
</div>
