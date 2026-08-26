<script lang="ts">
  import { t } from "$lib/i18n";
  import { openHelp } from "$lib/stores/helpStore";
  import { getHelpTopic, type HelpTopicId } from "$lib/help/topics";

  /**
   * The subtle contextual affordance: a small "?" that opens the help panel on
   * one topic. Deliberately quiet — it only gains contrast on hover/focus, so a
   * page can carry several without turning into a field of icons.
   */
  export let topic: HelpTopicId;
  export let size: "sm" | "md" = "md";

  let className = "";
  export { className as class };

  $: entry = getHelpTopic(topic);
  $: label = $t("help.ui.openHelpFor", {
    topic: entry ? $t(entry.titleKey) : $t("help.ui.title"),
  });
  $: box = size === "sm" ? "h-5 w-5 text-[0.7rem]" : "h-6 w-6 text-xs";
</script>

<button
  type="button"
  class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-transparent font-semibold text-subtle transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent {box} {className}"
  aria-label={label}
  title={label}
  on:click|stopPropagation={() => openHelp(topic)}
>
  ?
</button>
