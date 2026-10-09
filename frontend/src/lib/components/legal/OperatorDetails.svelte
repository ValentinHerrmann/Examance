<script lang="ts">
  import { t, type TranslationKey } from "#lib/i18n";
  import { legalOperator as op } from "#lib/legal/operator";
</script>

<!-- Operator identity for Impressum and Datenschutzerklärung; a missing build value renders as a marked placeholder. -->
{#snippet field(value: string, placeholder: TranslationKey)}
  {#if value}{value}{:else}<span class="placeholder">{$t(placeholder)}</span>{/if}
{/snippet}

<p>
  {@render field(op.name, "legal.operator.namePlaceholder")}<br />
  {@render field(op.street, "legal.operator.streetPlaceholder")}<br />
  {@render field(op.postcodeCity, "legal.operator.postcodeCityPlaceholder")}<br />
  {$t("legal.operator.country")}
</p>
<p>
  {$t("legal.operator.emailLabel")}
  {#if op.email}
    <a href="mailto:{op.email}" class="link">{op.email}</a>
  {:else}
    <span class="placeholder">{$t("legal.operator.emailPlaceholder")}</span>
  {/if}
  {#if op.phone}
    <br />{$t("legal.operator.phoneLabel")} {op.phone}
  {/if}
</p>
