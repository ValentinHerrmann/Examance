<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { sessionStore, isUnlocked, awaitSessionReady } from "$lib/stores/session";
  import { get } from "svelte/store";
  import { PageShell } from "$lib/components/ui";
  import ManualGradingContainer from "$lib/components/manual-grading/ManualGradingContainer.svelte";

  export let params: Record<string, string> = {};

  $: examId = $page.params.id || params.id || "";

  let initialized = false;

  onMount(async () => {
    await awaitSessionReady();
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
    initialized = true;
  });
</script>

<PageShell width="fluid">
  {#if initialized && examId}
    <ManualGradingContainer {examId} />
  {/if}
</PageShell>
