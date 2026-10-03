<script lang="ts">
  import { faDownload, faTrash } from "@fortawesome/free-solid-svg-icons";
  import type { StudentRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Button, Card, TableScroller } from "$lib/components/ui";

  interface Props {
    students: StudentRecord[];
    isErasing: boolean;
    onErase: (pseudonymId: string, examId: string) => void;
    onExport: (pseudonymId: string) => void;
  }

  let {
    students,
    isErasing,
    onErase,
    onExport
  }: Props = $props();
</script>

<Card title={$t("admin.gdprErasureTable.title")}>
  {#if students.length === 0}
    <p class="m-0 text-sm text-muted">
      {$t("admin.gdprErasureTable.empty")}
    </p>
  {:else}
    <TableScroller label={$t("admin.gdprErasureTable.title")}>
      <table class="data-table">
        <thead>
          <tr>
            <th>{$t("admin.gdprErasureTable.columnPseudonymId")}</th>
            <th>{$t("admin.gdprErasureTable.columnFallbackCode")}</th>
            <th>{$t("admin.gdprErasureTable.columnActions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each students as st}
            <tr>
              <td class="font-mono text-sm">{st.pseudonymId}</td>
              <td>{st.fallbackCode}</td>
              <td>
                <div class="flex flex-wrap gap-2">
                  <Button
                    variant="outlined"
                    size="sm"
                    icon={faDownload}
                    onClick={() => onExport(st.pseudonymId)}
                    disabled={isErasing}
                  >
                    {$t("admin.gdprErasureTable.exportButton")}
                  </Button>
                  <Button
                    severity="danger"
                    size="sm"
                    icon={faTrash}
                    onClick={() => onErase(st.pseudonymId, st.examId)}
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
  {/if}
</Card>
