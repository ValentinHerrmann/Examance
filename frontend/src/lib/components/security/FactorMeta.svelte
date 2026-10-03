<script lang="ts">
  /** The "added / last used" line. Null is not "never" (timestamps were added after the factors), so render "not recorded", never a date derived from account creation. */
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";

  interface Props {
    createdAt?: string | null;
    lastUsedAt?: string | null;
    /** Set when the factor is known never to have been used, rather than unrecorded. */
    neverUsed?: boolean;
  }

  let { createdAt = null, lastUsedAt = null, neverUsed = false }: Props = $props();
</script>

<p class="m-0 text-xs text-muted">
  {#if createdAt}
    {$t("security.page.added", { date: $fmt.date(new Date(createdAt)) })}
  {:else}
    {$t("security.page.addedUnknown")}
  {/if}
  ·
  {#if lastUsedAt}
    {$t("security.page.lastUsed", { date: $fmt.date(new Date(lastUsedAt)) })}
  {:else if neverUsed}
    {$t("security.page.neverUsed")}
  {:else}
    {$t("security.page.lastUsedUnknown")}
  {/if}
</p>
