<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { faSpinner } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * The single button recipe (Artemis button spec): a `variant` (solid /
   * outlined / text) times a `severity`. With `href` it renders an <a>, so a
   * navigation styled as a button is still a real link.
   *
   * Rules: one primary button per view; destructive actions confirm first and
   * are labelled with the verb ("Delete exam"); links navigate, buttons act.
   */
  type Variant = "solid" | "outlined" | "text";
  type LegacyVariant = "primary" | "secondary" | "danger" | "ghost" | "toolbar";
  type Severity = "primary" | "secondary" | "success" | "info" | "warning" | "danger" | "contrast";

  export let variant: Variant | LegacyVariant = "solid";
  export let severity: Severity = "primary";
  export let size: "sm" | "md" | "lg" = "md";
  export let type: "button" | "submit" | "reset" = "button";
  export let href: string | undefined = undefined;
  export let icon: IconDefinition | undefined = undefined;
  export let iconRight: IconDefinition | undefined = undefined;
  /** Round icon-only button. Requires `ariaLabel`. */
  export let iconOnly = false;
  export let disabled = false;
  export let loading = false;
  /** Toggle buttons: sets aria-pressed and the selected colours. */
  export let pressed: boolean | undefined = undefined;
  export let block = false;
  export let title: string | undefined = undefined;
  export let ariaLabel: string | undefined = undefined;
  export let onClick: ((event: MouseEvent) => void) | undefined = undefined;

  let className = "";
  export { className as class };

  /* Transitional: the pre-overhaul `variant` values. Removed once every call
   * site uses variant + severity. */
  const legacy: Record<LegacyVariant, [Variant, Severity]> = {
    primary: ["solid", "primary"],
    secondary: ["solid", "secondary"],
    danger: ["solid", "danger"],
    ghost: ["text", "secondary"],
    toolbar: ["text", "secondary"],
  };

  $: [v, s] = variant in legacy ? legacy[variant as LegacyVariant] : [variant as Variant, severity];

  /* Full literal class strings only — Tailwind v4 cannot see interpolated
   * names like `bg-${severity}`. */
  const solid: Record<Severity, string> = {
    primary: "border-transparent bg-primary text-primary-contrast",
    secondary: "border-transparent bg-surface-inset text-content",
    success: "border-transparent bg-success text-success-contrast",
    info: "border-transparent bg-info text-info-contrast",
    warning: "border-transparent bg-warning text-warning-contrast",
    danger: "border-transparent bg-danger text-danger-contrast",
    contrast: "border-transparent bg-content text-surface-raised",
  };
  const outlined: Record<Severity, string> = {
    primary: "border-primary bg-transparent text-accent",
    secondary: "border-line-strong bg-transparent text-content",
    success: "border-success bg-transparent text-success-fg",
    info: "border-info bg-transparent text-info-fg",
    warning: "border-warning bg-transparent text-warning-fg",
    danger: "border-danger bg-transparent text-danger-fg",
    contrast: "border-content bg-transparent text-content",
  };
  const text: Record<Severity, string> = {
    primary: "border-transparent bg-transparent text-accent",
    secondary: "border-transparent bg-transparent text-muted hover:text-content",
    success: "border-transparent bg-transparent text-success-fg",
    info: "border-transparent bg-transparent text-info-fg",
    warning: "border-transparent bg-transparent text-warning-fg",
    danger: "border-transparent bg-transparent text-danger-fg",
    contrast: "border-transparent bg-transparent text-content",
  };
  const variants: Record<Variant, Record<Severity, string>> = { solid, outlined, text };

  /* `sm` is for dense desktop toolbars; coarse pointers (iPad, phones) are
   * lifted to 44px either way. */
  const sizes = {
    sm: "min-h-8 gap-1.5 px-2.5 py-1.5 text-sm pointer-coarse:min-h-11",
    md: "min-h-10 gap-2 px-3 py-2 text-base pointer-coarse:min-h-11",
    lg: "min-h-12 gap-2 px-4 py-2.5 text-lg",
  };
  const iconSizes = {
    sm: "size-8 text-sm pointer-coarse:size-11",
    md: "size-10 text-base pointer-coarse:size-11",
    lg: "size-12 text-lg",
  };

  /* Hover and press tint the button with 5% / 10% of its own text colour
   * (Artemis), so one rule works for every severity in both themes. */
  const base =
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden border " +
    "font-normal whitespace-nowrap no-underline select-none transition-colors " +
    "after:pointer-events-none after:absolute after:inset-0 after:bg-current after:opacity-0 " +
    "hover:after:opacity-5 active:after:opacity-10 " +
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:after:opacity-0 " +
    "aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:after:opacity-0 " +
    "aria-pressed:border-primary aria-pressed:bg-highlight-strong aria-pressed:text-on-highlight";

  $: isDisabled = disabled || loading;
  $: shape = iconOnly ? `rounded-full p-0 ${iconSizes[size]}` : `rounded-md ${sizes[size]}`;
  $: classes = `${base} ${variants[v][s]} ${shape} ${block ? "w-full" : ""} ${className}`;
  $: leadingIcon = loading ? faSpinner : icon;
</script>

{#if href !== undefined}
  <!-- A disabled link has no href: not focusable, not followable. -->
  <a
    href={isDisabled ? undefined : href}
    role={isDisabled ? "link" : undefined}
    aria-disabled={isDisabled ? "true" : undefined}
    aria-label={ariaLabel}
    aria-busy={loading ? "true" : undefined}
    {title}
    class={classes}
    on:click={(event) => (isDisabled ? event.preventDefault() : onClick?.(event))}
    {...$$restProps}
  >
    {#if leadingIcon}<Icon icon={leadingIcon} spin={loading} />{/if}
    {#if !iconOnly}<slot />{/if}
    {#if iconRight && !iconOnly}<Icon icon={iconRight} />{/if}
  </a>
{:else}
  <button
    {type}
    {title}
    aria-label={ariaLabel}
    aria-busy={loading ? "true" : undefined}
    aria-pressed={pressed === undefined ? undefined : pressed ? "true" : "false"}
    disabled={isDisabled}
    class={classes}
    on:click={(event) => (isDisabled ? undefined : onClick?.(event))}
    {...$$restProps}
  >
    {#if leadingIcon}<Icon icon={leadingIcon} spin={loading} />{/if}
    {#if !iconOnly}<slot />{/if}
    {#if iconRight && !iconOnly}<Icon icon={iconRight} />{/if}
  </button>
{/if}
