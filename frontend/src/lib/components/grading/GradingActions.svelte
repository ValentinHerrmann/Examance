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

<!-- Below `lg` the status sits on its own line above the buttons; in the 11rem panel it shrinks to its icon between the arrows (issue #328), a failure keeps its own line. -->
<div class="flex flex-wrap items-center gap-2 md:gap-1">
  <div class="order-first flex min-h-5 w-full items-center justify-end {saveStatus.state === 'error' ? '' : 'md:order-none md:w-auto md:justify-center'}">
    <SaveStatus status={saveStatus} labelClass="md:sr-only" />
  </div>
  <Button
    class="flex-1 md:order-first"
    size="sm"
    variant="outlined"
    severity="secondary"
    icon={faArrowLeft}
    disabled={currentIndex === 0}
    onClick={onPrev}
    title={$t("grading.actions.prev")}
    ariaLabel={$t("grading.actions.prev")}
  ><span class="md:sr-only">{$t("grading.actions.prev")}</span></Button>
  <Button
    class="flex-1"
    size="sm"
    variant="outlined"
    severity="secondary"
    iconRight={faArrowRight}
    onClick={onNext}
    title={$t("grading.actions.next")}
    ariaLabel={$t("grading.actions.next")}
  ><span class="md:sr-only">{$t("grading.actions.next")}</span></Button>
</div>
