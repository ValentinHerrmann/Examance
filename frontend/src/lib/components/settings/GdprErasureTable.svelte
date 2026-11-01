<script lang="ts">
  import { faChevronLeft, faChevronRight, faDownload, faTrash } from "@fortawesome/free-solid-svg-icons";
  import type { StudentRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { Alert, Button, Card, Select, TableScroller, TextInput } from "#lib/components/ui";

  interface Props {
    students: StudentRecord[];
    /** Exams the students belong to, for the filter and the per-row label. */
    exams: { id: string; title: string }[];
    /** A failed read: shown instead of the "no students stored" text, which would be untrue. */
    loadError?: string;
    isErasing: boolean;
    onErase: (student: StudentRecord) => void;
    onExport: (student: StudentRecord) => void;
  }

  let { students, exams, loadError = "", isErasing, onErase, onExport }: Props = $props();

  const PAGE_SIZE = 10;

  let examFilter = $state("");
  let query = $state("");
  let page = $state(0);

  let examTitles = $derived(new Map(exams.map((e) => [e.id, e.title])));
  // Only exams that still have students, so the filter never offers an empty choice.
  let examOptions = $derived(
    exams
      .filter((e) => students.some((s) => s.examId === e.id))
      .sort((a, b) => a.title.localeCompare(b.title)),
  );
  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return students.filter(
      (s) =>
        (!examFilter || s.examId === examFilter) &&
        (!q || s.pseudonymHmac.toLowerCase().includes(q) || (s.fallbackCode ?? "").toLowerCase().includes(q)),
    );
  });
  let pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  // Erasing or filtering can shrink the list below the current page.
  let safePage = $derived(Math.min(page, pageCount - 1));
  let rows = $derived(filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE));

  function resetPage() {
    page = 0;
  }
</script>

<Card title={$t("admin.gdprErasureTable.title")}>
  {#if loadError}
    <Alert severity="danger">{loadError}</Alert>
  {:else if students.length === 0}
    <p class="m-0 text-sm text-muted">
      {$t("admin.gdprErasureTable.empty")}
    </p>
  {:else}
    <div class="mb-4 flex flex-col gap-3 sm:flex-row">
      <Select
        class="sm:w-64 sm:shrink-0"
        aria-label={$t("admin.gdprErasureTable.filterExam")}
        bind:value={examFilter}
        onchange={resetPage}
      >
        <option value="">{$t("admin.gdprErasureTable.allExams")}</option>
        {#each examOptions as exam (exam.id)}
          <option value={exam.id}>{exam.title}</option>
        {/each}
      </Select>
      <TextInput
        class="min-w-0 flex-1"
        type="search"
        aria-label={$t("admin.gdprErasureTable.search")}
        placeholder={$t("admin.gdprErasureTable.search")}
        bind:value={query}
        oninput={resetPage}
      />
    </div>

    {#if filtered.length === 0}
      <p class="m-0 text-sm text-muted">{$t("admin.gdprErasureTable.noMatch")}</p>
    {:else}
      <TableScroller label={$t("admin.gdprErasureTable.title")}>
        <table class="data-table">
          <thead>
            <tr>
              <th>{$t("admin.gdprErasureTable.columnFallbackCode")}</th>
              <th>{$t("admin.gdprErasureTable.columnExam")}</th>
              <th>{$t("admin.gdprErasureTable.columnPseudonymId")}</th>
              <th>{$t("admin.gdprErasureTable.columnActions")}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as st (`${st.examId}:${st.pseudonymHmac}`)}
              <tr>
                <td>{st.fallbackCode}</td>
                <td>{examTitles.get(st.examId) ?? "—"}</td>
                <td class="font-mono text-sm">{st.pseudonymHmac}</td>
                <td>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      variant="outlined"
                      size="sm"
                      icon={faDownload}
                      onClick={() => onExport(st)}
                      disabled={isErasing}
                    >
                      {$t("admin.gdprErasureTable.exportButton")}
                    </Button>
                    <Button
                      severity="danger"
                      size="sm"
                      icon={faTrash}
                      onClick={() => onErase(st)}
                      disabled={isErasing}
                    >
                      {$t("admin.gdprErasureTable.eraseButton")}
                    </Button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </TableScroller>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-muted" aria-live="polite">
          {$t("admin.gdprErasureTable.range", {
            from: safePage * PAGE_SIZE + 1,
            to: safePage * PAGE_SIZE + rows.length,
            total: filtered.length,
          })}
        </span>
        {#if pageCount > 1}
          <div class="flex items-center gap-2">
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faChevronLeft}
              disabled={safePage === 0}
              onClick={() => (page = safePage - 1)}
            >
              {$t("admin.gdprErasureTable.prev")}
            </Button>
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faChevronRight}
              disabled={safePage >= pageCount - 1}
              onClick={() => (page = safePage + 1)}
            >
              {$t("admin.gdprErasureTable.next")}
            </Button>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</Card>
