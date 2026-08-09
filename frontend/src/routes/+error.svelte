<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { httpErrorStore } from "$lib/stores/httpErrorStore";

  $: status = $page.status || 404;
  $: message = $page.error?.message || "Page not found";

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
      {status} - Error
    </h2>
    <p class="mb-6 text-slate-300">
      {message}
    </p>
    <div class="flex justify-center gap-3">
      <button
        class="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        on:click={() => goto("/")}
      >
        Return to Dashboard
      </button>
    </div>
  </div>
</div>
