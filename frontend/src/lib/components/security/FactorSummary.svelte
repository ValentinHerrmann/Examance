<script lang="ts">
  /**
   * The state of the account in one paragraph, above the individual factors.
   *
   * Two things a teacher cannot work out from the cards below on their own:
   * whether they are one loss away from being locked out, and whether anything
   * they hold can still *decrypt* their data. An authenticator cannot — its
   * secret lives server-side and six digits carry no entropy to derive a key
   * from — so an account whose only key-capable factor disappears keeps its
   * login and loses its exams.
   */
  import { Card } from "$lib/components/ui";
  import { t, translate, type TranslationKey } from "$lib/i18n";
  import type { FactorKind, MfaStatus } from "$lib/api/mfa";

  export let status: MfaStatus;

  const FACTOR_LABEL = {
    password: "security.panel.factorPassword",
    totp: "security.panel.factorTotp",
    passkey: "security.panel.factorPasskey",
  } as const satisfies Record<FactorKind, TranslationKey>;

  $: keyCapableLabels = status.key_capable.map((f) => translate(FACTOR_LABEL[f])).join(", ");
  // Exactly the minimum means every factor is load-bearing: lose one and only an
  // administrator can restore the account, and not the data.
  $: atMinimum = status.enrolled.length === status.required_factor_count;
</script>

<Card tone={status.complete ? "default" : "warning"}>
  <div class="flex flex-col gap-3">
    <div>
      <p class="m-0 text-sm font-medium text-muted">{$t("security.panel.enrolled")}</p>
      <ul class="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
        {#each status.enrolled as factor (factor)}
          <li class="rounded-md bg-surface-inset px-2 py-1 text-sm text-content">
            {$t(FACTOR_LABEL[factor])}
          </li>
        {/each}
      </ul>
    </div>

    <p class="m-0 text-sm text-muted">
      {status.complete
        ? $t("security.panel.policyOk", { count: status.required_factor_count })
        : $t("security.panel.policyIncomplete", { count: status.required_factor_count })}
    </p>

    <p class="m-0 text-sm text-muted">
      {status.key_capable.length > 0
        ? $t("security.panel.keyCapableHint", { list: keyCapableLabels })
        : $t("security.panel.keyCapableNone")}
    </p>

    {#if atMinimum || status.key_capable.length <= 1}
      <p
        class="m-0 rounded-lg border border-line-strong bg-surface-sunken p-3 text-sm text-content"
        role="alert"
      >
        {atMinimum
          ? $t("security.page.atMinimumWarning")
          : $t("security.page.oneKeyCapableWarning")}
      </p>
    {/if}
  </div>
</Card>
