<script lang="ts">
  import { faCheck } from "@fortawesome/free-solid-svg-icons";
  import type { StepStatus } from "#lib/exam/examProgress";
  import { Badge, Icon } from "#lib/components/ui";
  import { t } from "#lib/i18n";

  /** A step's status in the exam sidebar, drawer and exam-list cards: an attention count, a count (or x/y), or a check when done without a count. */
  interface Props {
    status: StepStatus | undefined;
  }

  let { status }: Props = $props();
</script>

{#if status}
  {#if status.alert}
    <Badge size="xs" severity="danger" title={$t("sharing.delivery.badge", { count: status.alert })}>{status.alert}</Badge>
  {:else if status.count !== undefined && status.total !== undefined}
    <Badge size="xs" severity={status.done ? "success" : "secondary"}>{status.count}/{status.total}</Badge>
  {:else if status.count !== undefined && status.count > 0}
    <Badge size="xs" severity={status.done ? "success" : "secondary"}>{status.count}</Badge>
  {:else if status.done}
    <Icon icon={faCheck} class="text-xs text-success-fg" />
    <span class="sr-only">{$t("exam.flow.done")}</span>
  {/if}
{/if}
