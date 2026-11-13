<script lang="ts">
  /** Renumbers the class list alphabetically (issue #266), after a confirm: printed stickers keep the numbers they carry. */
  import { get } from "svelte/store";
  import { faArrowDownAZ } from "@fortawesome/free-solid-svg-icons";
  import { ConfirmDialog, Menu, MenuItem } from "#lib/components/ui";
  import type { StudentRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { renumberStudents, savePositions, type NameOrder } from "#lib/students/classList";
  import { sessionStore } from "#lib/stores/session";

  interface Props {
    students: readonly StudentRecord[];
    onDone: () => void;
  }

  let { students, onDone }: Props = $props();

  let pending = $state<NameOrder | null>(null);
  let busy = $state(false);
  let error = $state("");

  async function apply() {
    if (!pending) return;
    busy = true;
    error = "";
    try {
      await savePositions(renumberStudents(students, pending), get(sessionStore).sessionKey);
      pending = null;
      onDone();
    } catch (err) {
      error = `${$t("lms.students.order.failed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      busy = false;
    }
  }
</script>

<Menu label={$t("lms.students.order.menu")} icon={faArrowDownAZ} align="start">
  <MenuItem onSelect={() => (pending = "lastName")}>{$t("lms.students.order.byLastName")}</MenuItem>
  <MenuItem onSelect={() => (pending = "firstName")}>{$t("lms.students.order.byFirstName")}</MenuItem>
</Menu>

<ConfirmDialog
  open={pending !== null}
  title={$t("lms.students.order.confirmTitle")}
  message={$t("lms.students.order.confirmMessage")}
  confirmText={$t("lms.students.order.confirm")}
  cancelText={$t("common.cancel")}
  role="dialog"
  {busy}
  {error}
  onConfirm={apply}
  onCancel={() => ((pending = null), (error = ""))}
/>
