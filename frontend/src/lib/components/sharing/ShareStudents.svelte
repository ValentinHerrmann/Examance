<script lang="ts">
  /** Step 1 of sharing results (issue #212): who gets their result. Students without a submission cannot be picked; links can be revoked per row. */
  import { t } from "#lib/i18n";
  import { faRotate } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, Checkbox, TableScroller, actionIcons } from "#lib/components/ui";
  import type { ResultDeliveryInfo, ResultShareInfo } from "#lib/api/resultShares";
  import type { ShareOverview, ShareStudent } from "#lib/sharing/shareService";
  import { formatDate } from "#lib/utils/format";
  import { artemisIdOf, mebisIdOf } from "#lib/utils/studentQr";
  import { deliveryBadge } from "#lib/sharing/deliveryBadge";
  import { gradeHref } from "#lib/utils/links";

  interface Props {
    examId: string;
    overview: ShareOverview;
    selected: Set<string>;
    running: boolean;
    onSelect: (next: Set<string>) => void;
    onSelectGraded: () => void;
    onRevoke: (shareId: string) => void;
    /** Re-renders the student's PDF under the same link (issue #226). */
    onUpdate: (share: ResultShareInfo) => void;
    /** The share being updated right now. */
    updatingId?: string | null;
    /** From xl, fill the parent's height and scroll the table inside it (the Share page's left column). */
    fill?: boolean;
  }

  let { examId, overview, selected, running, onSelect, onSelectGraded, onRevoke, onUpdate, updatingId = null, fill = false }: Props = $props();

  const STATE_BADGE = { complete: "success", partial: "warning", ungraded: "secondary" } as const;
  const DELIVERY_BADGE = { sent: "secondary", delayed: "warning", bounced: "danger", failed: "danger", revoked: "secondary" } as const;

  function toggle(student: ShareStudent, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(student.key);
    else next.delete(student.key);
    onSelect(next);
  }

  function deliveryTitle(d: ResultDeliveryInfo): string {
    const channelLabel = $t(d.channel === "email" ? "sharing.delivery.viaEmail" : "sharing.delivery.viaArtemis");
    return d.detail ? `${channelLabel}: ${d.detail}` : channelLabel;
  }

  function stateLabel(s: ShareStudent): string {
    return s.hasSubmission ? $t(`sharing.share.state.${s.state}`) : $t("sharing.share.state.noSubmission");
  }
</script>

<div class="flex min-w-0 flex-col gap-2 {fill ? 'xl:min-h-0 xl:flex-1' : ''}">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="text-sm text-muted">{$t("sharing.page.selectedCount", { count: selected.size, total: overview.students.length })}</span>
    <div class="flex gap-2">
      <Button size="sm" variant="text" disabled={running} onClick={onSelectGraded}>{$t("sharing.share.selectGraded")}</Button>
      <Button size="sm" variant="text" disabled={running} onClick={() => onSelect(new Set())}>{$t("sharing.share.selectNone")}</Button>
    </div>
  </div>
  <TableScroller maxHeight={fill ? "max-h-96 xl:max-h-none" : "max-h-96"} class={fill ? "xl:min-h-0 xl:flex-1" : ""}>
    <table class="data-table data-table-compact w-full">
      <thead>
        <tr>
          <th class="w-8"><span class="sr-only">{$t("sharing.share.colSelect")}</span></th>
          <th>{$t("sharing.share.colName")}</th>
          <th>{$t("sharing.share.colMebisId")}</th>
          <th>{$t("sharing.share.colArtemisId")}</th>
          <th>{$t("sharing.share.colEmail")}</th>
          <th>{$t("sharing.share.colState")}</th>
          <th>{$t("sharing.delivery.col")}</th>
          <th class="w-px"><span class="sr-only">{$t("sharing.share.colShare")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each overview.students as s (s.key)}
          {@const badge = deliveryBadge(s)}
          <tr>
            <td class="w-8">
              <Checkbox checked={selected.has(s.key)} onChange={(on) => toggle(s, on)} disabled={running || !s.hasSubmission} aria-label={s.name} />
            </td>
            <td class="min-w-0">{s.name}</td>
            <td class="text-sm text-muted tabular-nums">{mebisIdOf(s.student) ?? ""}</td>
            <td class="text-sm text-muted tabular-nums">{artemisIdOf(s.student) ?? ""}</td>
            <td class="text-sm whitespace-nowrap text-muted">{s.student.email ?? ""}</td>
            <td><Badge size="xs" severity={s.hasSubmission ? STATE_BADGE[s.state] : "secondary"}>{stateLabel(s)}</Badge></td>
            <!-- Delivery state with the link's expiry under it: no extra columns appear after a send, so the widths stay (issue #212). -->
            <td class="whitespace-nowrap">
              {#if badge}
                <Badge size="xs" severity={DELIVERY_BADGE[badge]} title={s.delivery ? deliveryTitle(s.delivery) : undefined}>{$t(`sharing.delivery.status.${badge}`)}</Badge>
              {/if}
              {#if s.share?.reviewSubmittedAt && s.submissionId}
                {@const answered = Boolean(s.share.reviewRepliedAt)}
                <a href={gradeHref(examId, { submissionId: s.submissionId })} class="no-underline" title={$t("review.students.openGrade")}>
                  <Badge size="xs" severity={answered ? "success" : "warning"}>{answered ? $t("review.students.answered") : $t("review.students.objection")}</Badge>
                </a>
              {/if}
              {#if s.share}<div class="text-xs text-muted">{$t("sharing.share.sharedUntil", { date: formatDate(s.share.expiresAt) })}</div>{/if}
              {#if s.share?.contentUpdatedAt}<div class="text-xs text-muted">{$t("review.students.updated", { date: formatDate(s.share.contentUpdatedAt) })}</div>{/if}
              {#if s.share && !s.share.updatable}<div class="text-xs text-warning-fg">{$t("review.students.notUpdatable")}</div>{/if}
            </td>
            <td class="text-right whitespace-nowrap">
              {#if s.share?.updatable}
                {@const shared = s.share}
                <Button size="sm" variant="text" iconOnly icon={faRotate} ariaLabel={$t("review.students.update")} title={$t("review.students.update")} loading={updatingId === shared.id} disabled={running || updatingId !== null} onClick={() => onUpdate(shared)} />
              {/if}
              {#if s.share}
                <Button size="sm" variant="text" severity="danger" iconOnly icon={actionIcons.remove} ariaLabel={$t("sharing.share.revokeLink")} title={$t("sharing.share.revokeLink")} disabled={running} onClick={() => s.share && onRevoke(s.share.id)} />
              {/if}
            </td>
          </tr>
        {/each}
        {#each overview.orphans as orphan (orphan.id)}
          <tr>
            <td></td>
            <td class="text-muted italic">{$t("sharing.share.removedStudent")}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td class="text-xs whitespace-nowrap text-muted">{$t("sharing.share.sharedUntil", { date: formatDate(orphan.expiresAt) })}</td>
            <td class="text-right">
              <Button size="sm" variant="text" severity="danger" iconOnly icon={actionIcons.remove} ariaLabel={$t("sharing.share.revokeLink")} title={$t("sharing.share.revokeLink")} disabled={running} onClick={() => onRevoke(orphan.id)} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </TableScroller>
</div>
