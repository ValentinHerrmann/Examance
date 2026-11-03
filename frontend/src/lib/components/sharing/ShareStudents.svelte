<script lang="ts">
  /** Step 1 of sharing results (issue #212): who gets their result. Students without a submission cannot be picked; links can be revoked per row. */
  import { t } from "#lib/i18n";
  import { Badge, Button, Checkbox, TableScroller, actionIcons } from "#lib/components/ui";
  import type { ResultDeliveryInfo } from "#lib/api/resultShares";
  import type { ShareOverview, ShareStudent } from "#lib/sharing/shareService";
  import { formatDate } from "#lib/utils/format";
  import { artemisIdOf, mebisIdOf } from "#lib/utils/studentQr";

  interface Props {
    overview: ShareOverview;
    selected: Set<string>;
    running: boolean;
    onSelect: (next: Set<string>) => void;
    onSelectGraded: () => void;
    onRevoke: (shareId: string) => void;
  }

  let { overview, selected, running, onSelect, onSelectGraded, onRevoke }: Props = $props();

  const STATE_BADGE = { complete: "success", partial: "warning", ungraded: "secondary" } as const;
  const DELIVERY_BADGE = { sent: "secondary", delayed: "warning", bounced: "danger", failed: "danger" } as const;

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

<div class="flex min-w-0 flex-col gap-2">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="text-sm text-muted">{$t("sharing.page.selectedCount", { count: selected.size, total: overview.students.length })}</span>
    <div class="flex gap-2">
      <Button size="sm" variant="text" disabled={running} onClick={onSelectGraded}>{$t("sharing.share.selectGraded")}</Button>
      <Button size="sm" variant="text" disabled={running} onClick={() => onSelect(new Set())}>{$t("sharing.share.selectNone")}</Button>
    </div>
  </div>
  <TableScroller maxHeight="max-h-96">
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
          <th colspan="2"><span class="sr-only">{$t("sharing.share.colShare")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each overview.students as s (s.key)}
          <tr>
            <td class="w-8">
              <Checkbox checked={selected.has(s.key)} onChange={(on) => toggle(s, on)} disabled={running || !s.hasSubmission} aria-label={s.name} />
            </td>
            <td class="min-w-0">{s.name}</td>
            <td class="text-sm text-muted tabular-nums">{mebisIdOf(s.student) ?? ""}</td>
            <td class="text-sm text-muted tabular-nums">{artemisIdOf(s.student) ?? ""}</td>
            <td class="min-w-0 text-sm break-all text-muted">{s.student.email ?? ""}</td>
            <td><Badge size="xs" severity={s.hasSubmission ? STATE_BADGE[s.state] : "secondary"}>{stateLabel(s)}</Badge></td>
            <td>
              {#if s.delivery}
                <Badge size="xs" severity={DELIVERY_BADGE[s.delivery.status]} title={deliveryTitle(s.delivery)}>{$t(`sharing.delivery.status.${s.delivery.status}`)}</Badge>
              {/if}
            </td>
            <td class="text-sm text-muted">
              {#if s.share}{$t("sharing.share.sharedUntil", { date: formatDate(s.share.expiresAt) })}{/if}
            </td>
            <td class="text-right">
              {#if s.share}
                <Button size="sm" variant="text" severity="danger" icon={actionIcons.remove} disabled={running} onClick={() => s.share && onRevoke(s.share.id)}>
                  {$t("sharing.share.revoke")}
                </Button>
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
            <td></td>
            <td class="text-sm text-muted">{$t("sharing.share.sharedUntil", { date: formatDate(orphan.expiresAt) })}</td>
            <td class="text-right">
              <Button size="sm" variant="text" severity="danger" icon={actionIcons.remove} disabled={running} onClick={() => onRevoke(orphan.id)}>{$t("sharing.share.revoke")}</Button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </TableScroller>
</div>
