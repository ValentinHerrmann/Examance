<script lang="ts">
  /** The sticker form as a dialog, opened on top of the Share page to reprint key slips without losing its state (issue #212). */
  import { t } from "#lib/i18n";
  import { Modal } from "#lib/components/ui";
  import StickerSheetForm from "./StickerSheetForm.svelte";

  interface Props {
    examId: string;
    /** Starts with only the key slips. */
    keysOnly?: boolean;
    onClose: () => void;
  }

  let { examId, keysOnly = false, onClose }: Props = $props();
  let busy = $state(false);
</script>

<Modal open={true} size="medium" title={$t("sharing.stickers.title")} onClose={busy ? undefined : onClose} closeOnEscape={!busy}>
  <StickerSheetForm {examId} {keysOnly} bind:busy onDone={onClose} />
</Modal>
