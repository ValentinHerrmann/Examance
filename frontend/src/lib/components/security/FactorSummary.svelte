<script lang="ts">
  /** Account state above the factors: how close to lockout, and whether any key-capable factor remains. An authenticator cannot decrypt data (secret is server-side), so losing the last key-capable factor loses the exams. */
  import { Alert, Badge, Card } from "#lib/components/ui";
  import { t, translate, type TranslationKey } from "#lib/i18n";
  import type { FactorKind, MfaStatus } from "#lib/api/mfa";

  interface Props {
    status: MfaStatus;
  }

  let { status }: Props = $props();

  const FACTOR_LABEL = {
    password: "security.panel.factorPassword",
    totp: "security.panel.factorTotp",
    passkey: "security.panel.factorPasskey",
  } as const satisfies Record<FactorKind, TranslationKey>;

  let keyCapableLabels = $derived(status.key_capable.map((f) => translate(FACTOR_LABEL[f])).join(", "));
  // Exactly the minimum means every factor is load-bearing: lose one and only an
  // administrator can restore the account, and not the data.
  let atMinimum = $derived(status.enrolled.length === status.required_factor_count);
</script>

<Card tone={status.complete ? "default" : "warning"}>
  <div class="flex flex-col gap-3">
    <div>
      <p class="m-0 text-sm font-medium text-muted">{$t("security.panel.enrolled")}</p>
      <ul class="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
        {#each status.enrolled as factor (factor)}
          <li><Badge>{$t(FACTOR_LABEL[factor])}</Badge></li>
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
      <Alert severity="warning">
        {atMinimum
          ? $t("security.page.atMinimumWarning")
          : $t("security.page.oneKeyCapableWarning")}
      </Alert>
    {/if}
  </div>
</Card>
