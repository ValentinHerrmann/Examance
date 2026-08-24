<script lang="ts">
  /** The standard raised panel. Replaces `background:#1e293b` in 36 files. */
  export let padded = true;
  export let tone: "default" | "danger" | "warning" = "default";

  const tones: Record<string, string> = {
    default: "border-line",
    danger: "border-red-500",
    warning: "border-amber-500",
  };

  let className = "";
  export { className as class };
</script>

<section
  class="min-w-0 rounded-xl border bg-surface-raised {tones[tone]} {padded
    ? 'p-4 lg:p-6'
    : ''} {className}"
>
  <slot />
</section>
