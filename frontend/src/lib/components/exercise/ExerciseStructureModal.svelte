<script lang="ts">
  import { t } from "#lib/i18n";
  import { Button, Modal } from "#lib/components/ui";
  import ExerciseStructurePanel from "./ExerciseStructurePanel.svelte";

  /** "Score & structure" on top of the exercise editor; edits go straight into the LaTeX, so there is no apply step. */
  interface Props {
    latex: string;
    isMc?: boolean;
    onChange: (latex: string) => void;
    onClose: () => void;
  }

  let { latex, isMc = false, onChange, onClose }: Props = $props();
</script>

<Modal open={true} size="medium" closeOnBackdrop title={$t("exercises.structure.title")} {onClose}>
  <ExerciseStructurePanel {latex} {isMc} {onChange} embedded />
  {#snippet footer()}
    <Button variant="text" severity="secondary" onClick={onClose}>{$t("common.close")}</Button>
  {/snippet}
</Modal>
