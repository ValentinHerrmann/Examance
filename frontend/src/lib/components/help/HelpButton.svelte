<script lang="ts">
  import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { openHelp } from "#lib/stores/helpStore";
  import { getHelpTopic, type HelpTopicId } from "#lib/help/topics";
  import { Button, Tooltip } from "#lib/components/ui";

  /** The subtle contextual affordance: a quiet "?" that opens the help panel on one topic. */
  interface Props {
    topic: HelpTopicId;
    size?: "sm" | "md";
    class?: string;
  }

  let { topic, size = "md", class: className = "" }: Props = $props();

  let entry = $derived(getHelpTopic(topic));
  let label = $derived($t("help.ui.openHelpFor", {
    topic: entry ? $t(entry.titleKey) : $t("help.ui.title"),
  }));
  let box = $derived(size === "sm" ? "size-6! text-sm" : "size-7! text-base");
</script>

<Tooltip text={label} wrapperClass="inline-flex shrink-0">
  <Button
    variant="text"
    severity="secondary"
    size="sm"
    iconOnly
    icon={faCircleQuestion}
    ariaLabel={label}
    class="{box} pointer-coarse:size-11! {className}"
    onClick={(event) => {
      event.stopPropagation();
      openHelp(topic);
    }}
  />
</Tooltip>
