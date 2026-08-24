<script lang="ts">
  /**
   * The single button recipe. Variants cover every filled/outlined/danger
   * spelling that used to be hand-typed per component.
   */
  export let variant: "primary" | "secondary" | "danger" | "ghost" | "toolbar" = "primary";
  export let size: "sm" | "md" | "lg" = "md";
  export let type: "button" | "submit" | "reset" = "button";
  export let disabled = false;
  export let loading = false;
  export let block = false;
  export let title: string | undefined = undefined;
  export let ariaLabel: string | undefined = undefined;
  export let onClick: ((event: MouseEvent) => void) | undefined = undefined;

  let className = "";
  export { className as class };

  const base =
    "inline-flex items-center justify-center gap-2 rounded-md border font-semibold " +
    "cursor-pointer transition-colors duration-150 select-none whitespace-nowrap " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
    "disabled:cursor-not-allowed disabled:opacity-60";

  const variants: Record<string, string> = {
    primary:
      "border-transparent bg-accent-strong text-white hover:enabled:bg-accent-hover",
    secondary:
      "border-line-strong bg-surface-inset text-content hover:enabled:bg-line-strong",
    danger: "border-transparent bg-red-600 text-white hover:enabled:bg-red-700",
    ghost:
      "border-transparent bg-transparent text-muted hover:enabled:bg-surface-inset hover:enabled:text-content",
    toolbar:
      "flex-col border-transparent bg-transparent text-muted rounded-lg " +
      "hover:enabled:bg-surface-raised hover:enabled:text-content aria-pressed:bg-accent-strong aria-pressed:text-white",
  };

  /* Hit areas stay finger-sized: `md` and `lg` clear 40px, and `sm` is only for
   * dense desktop toolbars where the coarse-pointer rule in app.css lifts it. */
  const sizes: Record<string, string> = {
    sm: "min-h-8 px-2.5 py-1 text-xs",
    md: "min-h-10 px-4 py-2 text-sm",
    lg: "min-h-11 px-6 py-3 text-base",
  };
</script>

<button
  {type}
  {title}
  aria-label={ariaLabel}
  disabled={disabled || loading}
  class="{base} {variants[variant]} {sizes[size]} {block ? 'w-full' : ''} {className}"
  class:is-loading={loading}
  on:click={onClick}
  {...$$restProps}
>
  <slot />
</button>
