<script lang="ts">
  import type { McVerificationStats } from "$lib/grading/mcVerification";

  export let stats: McVerificationStats;

  $: sortedExerciseBreakdown = [...stats.perExercise].sort((a, b) => {
    if (b.failed !== a.failed) return b.failed - a.failed;
    if (b.ambiguous !== a.ambiguous) return b.ambiguous - a.ambiguous;
    return a.exerciseLabel.localeCompare(b.exerciseLabel);
  });
</script>

<div class="space-y-6 mb-8">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div class="text-xs font-medium text-slate-400">Total Marked Boxes</div>
      <div class="mt-1 text-2xl font-bold text-slate-100">{stats.totalDetected}</div>
    </div>
    <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
      <div class="text-xs font-medium text-emerald-400">High Confidence</div>
      <div class="mt-1 text-2xl font-bold text-emerald-300">
        {stats.high}
        <span class="text-xs font-normal text-emerald-400/80">
          ({stats.totalDetected > 0 ? Math.round((stats.high / stats.totalDetected) * 100) : 0}%)
        </span>
      </div>
    </div>
    <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div class="text-xs font-medium text-amber-400">Unsure / Ambiguous</div>
      <div class="mt-1 text-2xl font-bold text-amber-300">
        {stats.ambiguous}
        <span class="text-xs font-normal text-amber-400/80">
          ({stats.totalDetected > 0 ? Math.round((stats.ambiguous / stats.totalDetected) * 100) : 0}%)
        </span>
      </div>
    </div>
    <div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
      <div class="text-xs font-medium text-red-400">Failed Detections</div>
      <div class="mt-1 text-2xl font-bold text-red-300">
        {stats.failed}
        <span class="text-xs font-normal text-red-400/80">
          ({stats.totalDetected > 0 ? Math.round((stats.failed / stats.totalDetected) * 100) : 0}%)
        </span>
      </div>
    </div>
  </div>

  {#if sortedExerciseBreakdown.length > 0}
    <div class="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div class="border-b border-slate-700 px-4 py-3 bg-slate-800/80">
        <h3 class="text-sm font-semibold text-slate-200">Per-Question Breakdown</h3>
        <p class="mt-0.5 text-[0.7rem] text-slate-500">Counts are marked boxes, not students — a question with several ticks counts each one.</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-slate-900/60 uppercase text-slate-400 font-medium">
            <tr>
              <th class="px-4 py-2.5">Question</th>
              <th class="px-4 py-2.5 text-right text-emerald-400">High</th>
              <th class="px-4 py-2.5 text-right text-amber-400">Unsure</th>
              <th class="px-4 py-2.5 text-right text-red-400">Failed</th>
              <th class="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-700/50">
            {#each sortedExerciseBreakdown as row}
              <tr class="hover:bg-slate-700/30 transition-colors">
                <td class="px-4 py-2.5 font-medium text-slate-200">{row.exerciseLabel}</td>
                <td class="px-4 py-2.5 text-right font-mono text-emerald-400">{row.high}</td>
                <td class="px-4 py-2.5 text-right font-mono text-amber-400">{row.ambiguous}</td>
                <td class="px-4 py-2.5 text-right font-mono text-red-400">{row.failed}</td>
                <td class="px-4 py-2.5 text-right font-mono text-slate-400">{row.total}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
