<script lang="ts">
  import { t } from "#lib/i18n";
  import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
  import { Button, SaveStatus } from "#lib/components/ui";
  import type { AutosaveStatus } from "#lib/utils/autosave";

  interface Props {
    /** Grading saves itself (issue #233); persistence and navigation stay route-owned, callbacks only forward user intent. */
    saveStatus: AutosaveStatus;
    onPrev: () => void;
    onNext: () => void;
    currentIndex: number;
  }

  let {
    saveStatus,
    onPrev,
    onNext,
    currentIndex
  }: Props = $props();
</script>

<div class="flex min-h-5 items-center justify-end">
  <SaveStatus status={saveStatus} />
</div>

<div class="flex flex-wrap gap-2">
  <Button
    class="flex-1"
    size="sm"
    variant="outlined"
    severity="secondary"
    icon={faArrowLeft}
    disabled={currentIndex === 0}
    onClick={onPrev}
    title={$t("grading.actions.prev")}
    ariaLabel={$t("grading.actions.prev")}
  ><span class="lg:sr-only">{$t("grading.actions.prev")}</span></Button>
  <Button
    class="flex-1"
    size="sm"
    variant="outlined"
    severity="secondary"
    iconRight={faArrowRight}
    onClick={onNext}
    title={$t("grading.actions.next")}
    ariaLabel={$t("grading.actions.next")}
  ><span class="lg:sr-only">{$t("grading.actions.next")}</span></Button>
</div>
