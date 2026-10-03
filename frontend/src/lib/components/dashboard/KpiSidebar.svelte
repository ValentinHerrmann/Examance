<script lang="ts">
  import { t } from "$lib/i18n";

  export let totalExams: number;
  export let subjectCount: number;
  export let gradeCount: number;
</script>

<div class="flex min-w-0 flex-col gap-3">
  <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 lg:flex lg:flex-col">
    <div class="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface-raised p-5">
      <span class="text-xs font-medium text-muted">{$t("dashboard.kpi.totalExams")}</span>
      <span class="text-3xl font-bold text-content">{totalExams}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface-raised p-5">
      <span class="text-xs font-medium text-muted">{$t("dashboard.kpi.subjectCount")}</span>
      <span class="text-3xl font-bold text-content">{subjectCount}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface-raised p-5">
      <span class="text-xs font-medium text-muted">{$t("dashboard.kpi.gradeCount")}</span>
      <span class="text-3xl font-bold text-content">{gradeCount}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-2 rounded-md border border-primary bg-highlight p-5">
      <span class="text-xs font-medium text-muted">{$t("dashboard.kpi.globalAnalytics")}</span>
      <a href="/analytics" class="mt-auto text-sm font-semibold text-accent no-underline hover:underline"
        >{$t("dashboard.kpi.viewStats")}</a
      >
    </div>
  </div>
</div>
