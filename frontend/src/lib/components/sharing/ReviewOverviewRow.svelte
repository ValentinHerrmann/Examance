<script lang="ts">
  // One objection in the overview (issue #226): pseudonym, status and dates; expanded, the whole conversation per item. The name shows only when revealed.
  import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Badge, Button, ExpandableCard } from "#lib/components/ui";
  import type { ReviewOverviewRow } from "#lib/sharing/reviewOverview";
  import { formatDate } from "#lib/utils/format";
  import { gradeHref } from "#lib/utils/links";

  interface Props {
    examId: string;
    row: ReviewOverviewRow;
    /** The page-wide "Show names" switch. */
    namesShown: boolean;
  }

  let { examId, row, namesShown }: Props = $props();

  let expanded = $state(false);
  let revealed = $state(false);
  let showName = $derived(namesShown || revealed);
  let pseudonym = $derived(`${$t("grading.header.idPrefix")} ${row.studentKey.substring(0, 10)}…`);

  const STATUS = { new: "warning", opened: "info", partial: "warning", answered: "success" } as const;
  const STATUS_KEY = { new: "review.overview.statusNew", opened: "review.overview.statusOpened", partial: "review.overview.statusPartial", answered: "review.overview.statusAnswered" } as const;
</script>

<ExpandableCard title={showName ? row.name : pseudonym} {expanded} onToggle={() => (expanded = !expanded)}>
  {#snippet badges()}
    <Badge size="xs" severity={STATUS[row.status]}>{$t(STATUS_KEY[row.status], { answered: row.answered, total: row.total })}</Badge>
    {#if row.fromRecord}<Badge size="xs" severity="secondary">{$t("review.overview.fromRecord")}</Badge>{/if}
    {#if row.items.length > 0}<span class="text-sm text-muted">{$t("review.form.item", { label: row.items.map((i) => i.label).join(", ") })}</span>{/if}
  {/snippet}
  {#snippet actions()}
    <Button size="sm" variant="text" severity="secondary" iconOnly icon={showName ? faEyeSlash : faEye} ariaLabel={showName ? $t("review.overview.hideName") : $t("review.overview.showName")} title={showName ? $t("review.overview.hideName") : $t("review.overview.showName")} disabled={namesShown} onClick={() => (revealed = !revealed)} />
    {#if row.submissionId}
      <Button size="sm" variant="outlined" severity="secondary" href={gradeHref(examId, { submissionId: row.submissionId })}>{$t("review.students.openGrade")}</Button>
    {/if}
  {/snippet}
  {#snippet preview()}
    <span class="text-xs text-muted">
      {#if row.submittedAt}{$t("review.overview.submitted", { date: formatDate(row.submittedAt) })}{/if}
      {#if row.repliedAt} · {$t("review.overview.replied", { date: formatDate(row.repliedAt) })}{/if}
      {#if row.reviewUntil && !row.repliedAt} · {$t("review.overview.until", { date: formatDate(row.reviewUntil) })}{/if}
    </span>
  {/snippet}
  {#snippet body()}
    {#if showName}<p class="m-0 mb-2 font-mono text-xs text-muted">{pseudonym}</p>{/if}
    {#if row.unreadable}
      <p class="m-0 text-sm text-warning-fg">{$t("review.thread.unreadable")}</p>
    {:else}
      <ul class="m-0 flex list-none flex-col gap-3 p-0">
        {#each row.items as item (item.key)}
          <li class="flex flex-col gap-1 border-l-2 border-warning pl-3">
            <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-content">
              {$t("review.form.item", { label: item.label })}
              {#if item.max !== null}<span class="text-xs font-normal text-muted">{$t("review.overview.maxPoints", { max: item.max })}</span>{/if}
              {#if item.pointsBefore !== null && item.pointsAfter !== null && item.pointsBefore !== item.pointsAfter}
                <span class="text-xs font-normal text-danger-fg">{$t("review.overview.points", { before: item.pointsBefore, after: item.pointsAfter })}</span>
              {/if}
            </p>
            <p class="m-0 text-xs text-muted">{$t("review.overview.objection")}</p>
            <p class="m-0 text-sm whitespace-pre-wrap wrap-anywhere text-content">{item.objection}</p>
            <p class="m-0 text-xs text-muted">{$t("review.overview.reply")}</p>
            {#if item.reply}
              <p class="m-0 text-sm whitespace-pre-wrap wrap-anywhere text-content">{item.reply}</p>
            {:else}
              <p class="m-0 text-sm text-muted italic">{$t("review.overview.noReply")}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}
</ExpandableCard>
