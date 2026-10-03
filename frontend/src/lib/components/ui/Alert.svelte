<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import {
    faCircleCheck,
    faCircleExclamation,
    faCircleInfo,
    faTriangleExclamation,
    faXmark,
  } from "@fortawesome/free-solid-svg-icons";
  import { t } from "$lib/i18n";
  import Icon from "./Icon.svelte";
  import Button from "./Button.svelte";

  /**
   * Inline message (Artemis message spec): a 10% tint with a 40% border and
   * the state's text colour, always with a leading icon. `danger` is announced
   * immediately (role="alert"), everything else politely (role="status").
   */
  type Severity = "info" | "success" | "warning" | "danger" | "secondary";

  export let severity: Severity = "info";
  export let title: string | undefined = undefined;
  export let icon: IconDefinition | undefined = undefined;
  export let onDismiss: (() => void) | undefined = undefined;

  let className = "";
  export { className as class };

  const tones: Record<Severity, string> = {
    info: "border-info/40 bg-info/10 text-info-fg",
    success: "border-success/40 bg-success/10 text-success-fg",
    warning: "border-warning/40 bg-warning/10 text-warning-fg",
    danger: "border-danger/40 bg-danger/10 text-danger-fg",
    secondary: "border-line bg-surface-inset text-content",
  };
  const icons: Record<Severity, IconDefinition> = {
    info: faCircleInfo,
    success: faCircleCheck,
    warning: faTriangleExclamation,
    danger: faCircleExclamation,
    secondary: faCircleInfo,
  };
</script>

<div
  role={severity === "danger" ? "alert" : "status"}
  class="flex min-w-0 items-start gap-3 rounded-md border px-3 py-2 {tones[severity]} {className}"
>
  <Icon icon={icon ?? icons[severity]} class="mt-1 text-base" />
  <div class="min-w-0 flex-1 text-sm">
    {#if title}<p class="m-0 font-semibold">{title}</p>{/if}
    <div class="font-medium {title ? 'mt-0.5' : ''}"><slot /></div>
    {#if $$slots.actions}
      <div class="mt-2 flex flex-wrap items-center gap-2"><slot name="actions" /></div>
    {/if}
  </div>
  {#if onDismiss}
    <Button
      variant="text"
      severity="secondary"
      size="sm"
      iconOnly
      icon={faXmark}
      ariaLabel={$t("common.close")}
      onClick={onDismiss}
    />
  {/if}
</div>
