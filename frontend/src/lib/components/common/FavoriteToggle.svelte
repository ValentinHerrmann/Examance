<script lang="ts">
  import { t } from "#lib/i18n";
  import { Button, actionIcons } from "#lib/components/ui";

  /** The star on an overview-list card (issue #252); the exam list and the library share it. */
  interface Props {
    favorite: boolean;
    onToggle: (on: boolean) => void;
  }

  let { favorite, onToggle }: Props = $props();
</script>

<Button
  variant="text"
  severity={favorite ? "warning" : "secondary"}
  size="sm"
  iconOnly
  icon={actionIcons.favorite}
  pressed={favorite}
  ariaLabel={favorite ? $t("common.listSections.unfavorite") : $t("common.listSections.favorite")}
  title={favorite ? $t("common.listSections.unfavorite") : $t("common.listSections.favorite")}
  class={favorite ? "" : "opacity-50 hover:opacity-100"}
  onClick={() => onToggle(!favorite)}
/>
