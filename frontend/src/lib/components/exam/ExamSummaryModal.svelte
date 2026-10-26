<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import type { LazyEntry } from "#lib/utils/lazyMap";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { examRepository } from "#lib/repositories/examRepository";
  import { exerciseRepository } from "#lib/repositories/exerciseRepository";
  import { loadExamLogoPreview, type ExamLogoPreview } from "#lib/latex/logo";
  import { examHref } from "#lib/utils/links";
  import { t } from "#lib/i18n";
  import { Button, Modal, Spinner } from "#lib/components/ui";
  import ExamSummary from "./ExamSummary.svelte";

  interface Props {
    examId: string;
    onClose: () => void;
  }

  let { examId, onClose }: Props = $props();

  let exam = $state.raw<ExamRecord | null>(null);
  let exercises = $state.raw<LazyEntry<ExerciseRecord[]>>({ status: "loading" });
  let logo = $state.raw<LazyEntry<ExamLogoPreview>>({ status: "loading" });
  let error = $state("");

  onMount(() => {
    let alive = true;
    (async () => {
      try {
        await awaitSessionReady();
        const key = get(sessionStore).sessionKey;
        const loaded = await examRepository.getById(examId, key);
        if (!alive) return;
        if (!loaded) {
          error = get(t)("common.loadFailedShort");
          return;
        }
        exam = loaded;
      } catch {
        if (alive) error = get(t)("common.loadFailedShort");
        return;
      }
      const key = get(sessionStore).sessionKey;
      exerciseRepository.getByExamId(examId, key).then(
        (value) => alive && (exercises = { status: "ready", value }),
        () => alive && (exercises = { status: "error" })
      );
      loadExamLogoPreview(examId).then(
        (value) => alive && (logo = { status: "ready", value }),
        () => alive && (logo = { status: "error" })
      );
    })();
    return () => (alive = false);
  });
</script>

<Modal open={true} size="large" closeOnBackdrop {onClose} {error}>
  {#snippet header()}
    <div class="flex min-w-0 flex-col items-start gap-2">
      <Button size="sm" variant="outlined" severity="secondary" icon={faUpRightFromSquare} href={examHref(examId)} target="_blank" rel="noopener noreferrer">
        {$t("common.openInNewTab")}
      </Button>
      {#if exam}
        <h2 class="m-0 truncate text-xl font-semibold text-content">{exam.title || $t("dashboard.examList.untitledExam")}</h2>
      {/if}
    </div>
  {/snippet}

  {#if exam}
    <div class="mb-3 flex flex-wrap items-center gap-1.5">
      <ExamSummary {exam} part="badges" />
    </div>
    <ExamSummary {exam} {exercises} {logo} />
  {:else if !error}
    <div class="flex justify-center p-8"><Spinner /></div>
  {/if}
</Modal>
