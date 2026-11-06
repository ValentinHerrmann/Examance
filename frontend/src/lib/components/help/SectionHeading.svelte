<script lang="ts">
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  /** A small uppercase section label with its explanation behind ⓘ: the one heading of option groups (Print step plan, Exam step tabs). Lives beside InfoTip, which imports the ui index. */
  interface Props {
    label: string;
    /** The explanation behind ⓘ; none shows the label alone. */
    info?: string;
    /** For `aria-labelledby` of the group it heads. */
    id?: string;
    /** `h3` for a section of a card, `span` inside a fieldset or radiogroup. */
    tag?: "h3" | "span";
    class?: string;
  }

  let { label, info = undefined, id = undefined, tag = "span", class: className = "" }: Props = $props();
</script>

<span class="flex items-center gap-1.5 {className}">
  <svelte:element this={tag} {id} class="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{label}</svelte:element>
  {#if info}<InfoTip text={info} />{/if}
</span>
