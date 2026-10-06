<script lang="ts">
  // The centered card with logo and title that every page around signing in shares.
  import type { Snippet } from "svelte";
  import { Card, PageShell } from "#lib/components/ui";

  interface Props {
    title: string;
    subtitle?: string;
    children: Snippet;
  }

  let { title, subtitle, children }: Props = $props();
</script>

<PageShell width="form" center>
  <Card class="sm:p-8">
    <div class="mb-6 text-center">
      <img src="/favicon.png" alt="Examance logo" class="mx-auto mb-3 size-14 rounded-xl object-contain" />
      <h1 class="m-0 text-2xl font-normal text-content">{title}</h1>
      {#if subtitle}<p class="mt-2 mb-0 text-sm leading-snug text-muted">{subtitle}</p>{/if}
    </div>
    {@render children()}
  </Card>
</PageShell>
