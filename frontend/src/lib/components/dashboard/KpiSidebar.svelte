<script lang="ts">
  import { t } from "$lib/i18n";

  export let totalExams: number;
  export let subjectCount: number;
  export let gradeCount: number;
</script>

<div class="flex min-w-0 flex-col gap-3">
  <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 lg:flex lg:flex-col">
    <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-5">
      <span class="text-[0.8rem] font-medium text-slate-400">{$t("dashboard.kpi.totalExams")}</span>
      <span class="text-[1.75rem] font-bold text-slate-50">{totalExams}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-5">
      <span class="text-[0.8rem] font-medium text-slate-400">{$t("dashboard.kpi.subjectCount")}</span>
      <span class="text-[1.75rem] font-bold text-slate-50">{subjectCount}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-5">
      <span class="text-[0.8rem] font-medium text-slate-400">{$t("dashboard.kpi.gradeCount")}</span>
      <span class="text-[1.75rem] font-bold text-slate-50">{gradeCount}</span>
    </div>
    <div class="flex min-w-0 flex-col gap-2 rounded-lg border border-sky-600 bg-sky-600/10 p-5">
      <span class="text-[0.8rem] font-medium text-slate-400">{$t("dashboard.kpi.globalAnalytics")}</span>
      <a href="/analytics" class="mt-auto text-sm font-semibold text-sky-400 no-underline hover:underline"
        >{$t("dashboard.kpi.viewStats")}</a
      >
    </div>
  </div>
</div>
