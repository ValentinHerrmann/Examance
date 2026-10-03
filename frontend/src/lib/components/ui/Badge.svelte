<script lang="ts">
  import type { Snippet } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  type Severity = "primary" | "secondary" | "success" | "info" | "warning" | "danger" | "contrast";

  /** Tag / status badge (Artemis spec). Colour is never the only signal; pair it with a word or an icon. */
  interface Props {
    severity?: Severity;
    /** `xs` for counts inside nav items and table cells. */
    size?: "xs" | "sm";
    icon?: IconDefinition | undefined;
    title?: string | undefined;
    class?: string;
    children?: Snippet;
  }

  let {
    severity = "secondary",
    size = "sm",
    icon = undefined,
    title = undefined,
    class: className = "",
    children,
  }: Props = $props();

  const tones: Record<Severity, string> = {
    primary: "bg-primary/20 text-accent",
    secondary: "bg-surface-inset text-content",
    success: "bg-success/20 text-success-fg",
    info: "bg-info/20 text-info-fg",
    warning: "bg-warning/20 text-warning-fg",
    danger: "bg-danger/20 text-danger-fg",
    contrast: "bg-content text-surface-raised",
  };
  const sizes = {
    xs: "gap-1 px-1.5 py-0.5 text-xs",
    sm: "gap-1.5 px-2 py-1 text-sm",
  };
</script>

<span
  class="inline-flex max-w-full items-center rounded-md font-semibold whitespace-nowrap {tones[
    severity
  ]} {sizes[size]} {className}"
  {title}
>
  {#if icon}<Icon {icon} />{/if}
  <span class="min-w-0 truncate">{@render children?.()}</span>
</span>
