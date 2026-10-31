<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card } from "#lib/components/ui";
  import { t } from "#lib/i18n";

  /** Shell of a security-page factor card: title with enrolled/missing status (or an intro), then the body. */
  interface Props {
    title: string;
    enrolled?: boolean;
    intro?: string;
    tone?: "default" | "warning";
    children: Snippet;
  }

  let { title, enrolled, intro, tone = "default", children }: Props = $props();
</script>

<Card {tone}>
  <div class="flex flex-col gap-4">
    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-xl font-medium text-content">{title}</h2>
        {#if enrolled !== undefined}
          <span class="text-sm text-muted">
            {enrolled ? $t("security.page.statusEnrolled") : $t("security.page.statusMissing")}
          </span>
        {/if}
      </div>
      {#if intro}<p class="mt-1 text-sm text-muted">{intro}</p>{/if}
    </div>
    {@render children()}
  </div>
</Card>
