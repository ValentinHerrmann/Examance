<script lang="ts">
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import { faArrowLeft, faArrowRight, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";

  interface Props {
    /** Persistence and navigation stay route-owned; callbacks only forward user intent. */
    onSave: () => void;
    onPrev: () => void;
    onNext: () => void;
    currentIndex: number;
  }

  let {
    onSave,
    onPrev,
    onNext,
    currentIndex
  }: Props = $props();
</script>

<Button block icon={faFloppyDisk} disabled={$gradingStore.isSaving} onClick={onSave}>
  {$gradingStore.isSaving ? $t("grading.actions.saving") : $t("grading.actions.save")}
</Button>

<div class="flex flex-wrap gap-2">
  <Button
    class="flex-1"
    size="sm"
    variant="outlined"
    severity="secondary"
    icon={faArrowLeft}
    disabled={currentIndex === 0}
    onClick={onPrev}
  >{$t("grading.actions.prev")}</Button>
  <Button
    class="flex-1"
    size="sm"
    variant="outlined"
    severity="secondary"
    iconRight={faArrowRight}
    onClick={onNext}
  >{$t("grading.actions.next")}</Button>
</div>
