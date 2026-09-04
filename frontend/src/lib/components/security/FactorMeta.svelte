<script lang="ts">
  /**
   * The "added / last used" line under a factor.
   *
   * Null is not "never" — these timestamps were added after the factors were,
   * so an account that has been signing in for months can legitimately have
   * none. Saying "not recorded" is the honest rendering; showing a date derived
   * from the account's creation would be an invention.
   */
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";

  export let createdAt: string | null = null;
  export let lastUsedAt: string | null = null;
  /** Set when the factor is known never to have been used, rather than unrecorded. */
  export let neverUsed = false;
</script>

<p class="m-0 text-xs text-subtle">
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
