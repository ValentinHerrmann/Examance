<script lang="ts">
  import { goto } from "$app/navigation";
  import "./+page.css";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { sessionStore, isUnlocked } from "$lib/stores/session";
  import { get } from "svelte/store";
  import ManualGradingContainer from "$lib/components/manual-grading/ManualGradingContainer.svelte";

  export let params: Record<string, string> = {};

  $: examId = $page.params.id || params.id || "";

  let initialized = false;

  onMount(async () => {
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
    initialized = true;
  });
</script>

<div class="manual-grading-page">
  {#if initialized && examId}
    <ManualGradingContainer {examId} />
  {/if}
</div>
