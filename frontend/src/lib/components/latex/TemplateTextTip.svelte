<script lang="ts">
  // The tooltip for a click on text the template generates (issue #347): nothing jumps, it only says why.
  import { t } from "#lib/i18n";
  import { Popover } from "#lib/components/ui";
  import type { PreviewSync } from "#lib/latex/previewSync.svelte";

  interface Props {
    sync: PreviewSync;
  }

  let { sync }: Props = $props();
</script>

<Popover
  open={sync.tip !== null}
  anchorPoint={sync.tip}
  placement="top-start"
  onClose={() => (sync.tip = null)}
  panelClass="px-2.5 py-1.5 text-xs"
>
  <span role="status">{$t("editor.pdfPreview.templateText")}</span>
</Popover>
