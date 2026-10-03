<script lang="ts">
  import { t } from "$lib/i18n";
  import { Card } from "$lib/components/ui";

  export let totalExams: number;
  export let subjectCount: number;
  export let gradeCount: number;
</script>

<div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3 xl:flex xl:flex-col">
  <Card class="flex flex-col gap-2">
    <span class="text-sm text-muted">{$t("dashboard.kpi.totalExams")}</span>
    <span class="text-3xl font-semibold text-content">{totalExams}</span>
  </Card>
  <Card class="flex flex-col gap-2">
    <span class="text-sm text-muted">{$t("dashboard.kpi.subjectCount")}</span>
    <span class="text-3xl font-semibold text-content">{subjectCount}</span>
  </Card>
  <Card class="flex flex-col gap-2">
    <span class="text-sm text-muted">{$t("dashboard.kpi.gradeCount")}</span>
    <span class="text-3xl font-semibold text-content">{gradeCount}</span>
  </Card>
  <Card class="flex flex-col gap-2 bg-highlight">
    <span class="text-sm text-muted">{$t("dashboard.kpi.globalAnalytics")}</span>
    <a href="/analytics" class="mt-auto text-sm font-semibold text-accent no-underline hover:underline"
      >{$t("dashboard.kpi.viewStats")}</a
    >
  </Card>
</div>
