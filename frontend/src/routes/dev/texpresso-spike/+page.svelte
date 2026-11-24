<script lang="ts">
  /** TeXpresso spike (dev and preview builds only): incremental XeTeX in the browser with PDF-side editing. Report: docs/dev/latex_performance.md. */
  import { onDestroy, onMount } from "svelte";
  import { t } from "#lib/i18n";
  import { Alert, Button, PageHeader, PageShell, Select, TableScroller } from "#lib/components/ui";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import { loadLatexAssets } from "#lib/latex/assets";
  import { compileLatex, type AuxFile } from "#lib/latex/compiler";
  import { extractSourceMap, mapLine, type SourceMap } from "#lib/latex/sourceMap";
  import { renderPdfPages, type RenderedPage } from "#lib/pdf/renderPages";
  import { SpikeClient, type BenchRow, type CompileReply, type InitInfo } from "#lib/latex/texpresso-spike/client";
  import { SAMPLES, benchEdits, withPreambleEdit, type SampleExercise } from "#lib/latex/texpresso-spike/samples";
  import { columnOf, parseSynctex, positionOf, sourceAt, type SyncData } from "#lib/latex/texpresso-spike/synctex";
  import { wordAt } from "#lib/latex/texpresso-spike/pdfPick";
  import { clickAccuracy, type AccuracyRow } from "#lib/latex/texpresso-spike/accuracy";

  const PT_PER_MM = 72 / 25.4;

  let client: SpikeClient | null = null;
  let sampleId = $state(SAMPLES[0].id);
  let exercises = $state.raw<SampleExercise[]>(SAMPLES[0].exercises);
  let selected = $state("0");
  let body = $state(SAMPLES[0].exercises[0].body);
  let status = $state<"booting" | "compiling" | "ready" | "failed">("booting");
  let failure = $state("");
  let init = $state.raw<InitInfo | null>(null);
  let reply = $state.raw<CompileReply | null>(null);
  let pages = $state.raw<RenderedPage[]>([]);
  let sync: SyncData | null = null;
  let map: SourceMap = { tex: "", ranges: [] };
  let pdf: Uint8Array | null = null;
  let clickInfo = $state("");
  let overlay = $state.raw<{ page: number; xMm: number; yMm: number; text: string } | null>(null);
  let bench = $state.raw<BenchRow[]>([]);
  let benchRunning = $state(false);
  let baseline = $state("");
  let accuracy = $state.raw<AccuracyRow[]>([]);
  let editor: LatexEditor | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let compiling = false;
  let queued = false;
  let typedSinceCompile = "";

  const sample = $derived(SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0]);

  function documentFor(list: SampleExercise[]): string {
    return sample.build(list);
  }

  /** One compile at a time; edits during a compile coalesce into the next one. */
  async function compile(full = false) {
    if (!client || compiling) {
      queued = true;
      return;
    }
    compiling = true;
    queued = false;
    status = "compiling";
    const marked = documentFor(exercises);
    map = extractSourceMap(marked);
    try {
      typedSinceCompile = "";
      const r = await client.compile(map.tex, full);
      reply = r;
      sync = r.synctex ? parseSynctex(r.synctex) : null;
      if (r.pdf) {
        pdf = r.pdf;
        pages = await renderPdfPages(r.pdf, 3);
      }
      overlay = null;
      // For the measurement scripts (scripts/texpresso-spike/): the last output, read with page.evaluate.
      (globalThis as { __texpressoSpike?: unknown }).__texpressoSpike = { pdf: r.pdf, synctex: r.synctex };
      status = r.error ? "failed" : "ready";
      failure = r.error ?? "";
    } catch (err) {
      status = "failed";
      failure = err instanceof Error ? err.message : String(err);
    } finally {
      compiling = false;
      if (queued) void compile();
    }
  }

  function onEdit(value: string) {
    const i = Number(selected);
    const before = exercises[i].body;
    exercises = exercises.map((e, k) => (k === i ? { ...e, body: value } : e));
    if (value.length > before.length) showProvisional(value.length - before.length, value);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void compile(), 120);
  }

  /** Draws the newly typed characters where the cursor's line was typeset, until TeX's page replaces them. */
  function showProvisional(added: number, value: string) {
    const cursor = editor?.getCursor();
    if (!cursor || !sync) return;
    const offset = value.split("\n").slice(0, cursor.line - 1).join("\n").length + (cursor.line > 1 ? 1 : 0) + cursor.column;
    typedSinceCompile = (typedSinceCompile + value.slice(Math.max(0, offset - added), offset)).slice(-40);
    const range = map.ranges.find((r) => r.label === exercises[Number(selected)].name);
    if (!range) return;
    const pos = positionOf(sync, "main.tex", range.start + cursor.line - 1);
    if (pos) overlay = { page: pos.page, xMm: pos.x / PT_PER_MM, yMm: pos.y / PT_PER_MM, text: typedSinceCompile };
  }

  async function onPageClick(event: MouseEvent, index: number) {
    if (!sync || !pdf) return;
    const img = event.currentTarget as HTMLElement;
    const rect = img.getBoundingClientRect();
    const page = pages[index];
    const x = ((event.clientX - rect.left) / rect.width) * page.widthMm * PT_PER_MM;
    const y = ((event.clientY - rect.top) / rect.height) * page.heightMm * PT_PER_MM;
    const hit = sourceAt(sync, index + 1, x, y);
    if (!hit) {
      clickInfo = $t("texpressoSpike.clickNone");
      return;
    }
    if (!hit.file.endsWith("main.tex")) {
      clickInfo = $t("texpressoSpike.clickTemplate", { line: hit.line, file: hit.file.split("/").pop() ?? hit.file });
      return;
    }
    const loc = mapLine(map, hit.line);
    const target = loc?.label ? exercises.findIndex((e) => e.name === loc.label) : -1;
    if (!loc || target < 0) {
      clickInfo = $t("texpressoSpike.clickTemplate", { line: hit.line, file: "main.tex" });
      return;
    }
    const word = await wordAt(pdf, index + 1, x, y);
    const column = Math.max(0, columnOf(exercises[target].body.split("\n")[loc.line - 1] ?? "", word));
    selectExercise(String(target));
    queueMicrotask(() => editor?.setCursor(loc.line, column));
    clickInfo = $t("texpressoSpike.clickHit", { exercise: exercises[target].name, line: loc.line, column: column + 1 });
  }

  function selectExercise(value: string) {
    selected = value;
    body = exercises[Number(value)].body;
  }

  function changeSample(id: string) {
    sampleId = id;
    exercises = (SAMPLES.find((s) => s.id === id) ?? SAMPLES[0]).exercises;
    selectExercise("0");
    void compile();
  }

  async function runBench() {
    if (!client) return;
    benchRunning = true;
    try {
      const base = extractSourceMap(documentFor(exercises)).tex;
      const edits = benchEdits({ ...sample, exercises }).map((e) => ({
        label: e.label,
        tex: e.preamble ? withPreambleEdit(base) : extractSourceMap(documentFor(e.exercises ?? exercises)).tex,
      }));
      bench = await client.bench(base, edits);
    } finally {
      benchRunning = false;
    }
  }

  /** The same document through the production busytex engine: one fresh compile, then one seeded with its aux. */
  async function runBaseline() {
    const tex = extractSourceMap(documentFor(exercises)).tex;
    // Spike measurement: bypasses compileWithCache on purpose, a cache hit would measure nothing.
    const fresh = await compileLatex(tex, true, undefined, false);
    const seeded = await compileLatex(tex, true, undefined, false, { seedAux: fresh.aux as AuxFile[] });
    baseline = $t("texpressoSpike.baselineResult", { fresh: fresh.durationMs ?? 0, seeded: seeded.durationMs ?? 0 });
  }

  async function runAccuracy() {
    if (pdf && sync) accuracy = await clickAccuracy(pdf, sync, map, exercises);
  }

  const fmtMs = (n: number) => n.toFixed(0);
  const fromLabel = (r: CompileReply) => {
    const last = r.passes[0]?.resumedFrom;
    return last === "start" || last === undefined ? $t("texpressoSpike.fromStart") : $t("texpressoSpike.fromCheckpoint", { n: last });
  };

  onMount(async () => {
    client = new SpikeClient();
    try {
      init = await client.init(await loadLatexAssets());
      status = "ready";
      await compile();
    } catch (err) {
      status = "failed";
      failure = err instanceof Error ? err.message : String(err);
    }
  });

  onDestroy(() => {
    if (timer) clearTimeout(timer);
    client?.terminate();
  });

</script>

<PageShell width="full">
  <PageHeader title={$t("texpressoSpike.title")} subtitle={$t("texpressoSpike.hint")} />

  <div class="mb-3 flex flex-wrap items-end gap-3">
    <label class="flex min-w-0 flex-col gap-1 text-sm">
      {$t("texpressoSpike.sample")}
      <Select value={sampleId} onchange={(e) => changeSample((e.currentTarget as HTMLSelectElement).value)}>
        {#each SAMPLES as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
      </Select>
    </label>
    <label class="flex min-w-0 flex-col gap-1 text-sm">
      {$t("texpressoSpike.exercise")}
      <Select value={selected} onchange={(e) => selectExercise((e.currentTarget as HTMLSelectElement).value)}>
        {#each exercises as e, i (e.name)}<option value={String(i)}>{e.name}</option>{/each}
      </Select>
    </label>
    <Button variant="outlined" severity="secondary" disabled={status === "booting"} onClick={() => void compile(true)}>{$t("texpressoSpike.fullCompile")}</Button>
    <Button variant="outlined" severity="secondary" disabled={status === "booting" || benchRunning} loading={benchRunning} onClick={() => void runBench()}>
      {benchRunning ? $t("texpressoSpike.benchRunning") : $t("texpressoSpike.bench")}
    </Button>
    <Button variant="outlined" severity="secondary" disabled={status === "booting"} onClick={() => void runBaseline()}>{$t("texpressoSpike.baseline")}</Button>
    <Button variant="outlined" severity="secondary" disabled={status === "booting"} onClick={() => void runAccuracy()}>{$t("texpressoSpike.accuracy")}</Button>
  </div>

  <p class="text-muted mb-2 text-sm" data-testid="spike-status">
    {#if status === "failed"}{$t("texpressoSpike.status.failed", { message: failure.split("\n")[0] })}
    {:else}{$t(`texpressoSpike.status.${status}`)}{/if}
    {#if reply}
      · {$t("texpressoSpike.timing", { total: fmtMs(reply.totalMs), engine: fmtMs(reply.engineMs), passes: reply.passes.length, from: fromLabel(reply), xdv: fmtMs(reply.xdvMs) })}
      · {$t("texpressoSpike.memory", { checkpoints: reply.checkpoints, snapshot: (reply.checkpointBytes / 2 ** 20).toFixed(0), memory: (reply.memoryBytes / 2 ** 20).toFixed(0) })}
    {/if}
    {#if baseline} · {baseline}{/if}
  </p>
  {#if clickInfo}<p class="mb-2 text-sm" data-testid="spike-click">{clickInfo}</p>{/if}

  <div class="grid min-w-0 gap-4 lg:grid-cols-2">
    <div class="min-w-0">
      <LatexEditor bind:this={editor} bind:value={body} rows={24} onChange={onEdit} />
      {#if bench.length > 0}
        <TableScroller>
          <table class="data-table data-table-compact mt-3" data-testid="spike-bench">
            <thead><tr><th>Edit</th><th>Engine ms</th><th>Passes</th><th>xdvipdfmx ms</th><th>Full ms</th><th>Identical</th><th>Snapshots MB</th></tr></thead>
            <tbody>
              {#each bench as row (row.label)}
                <tr>
                  <td>{row.label}</td><td>{fmtMs(row.engineMs)}</td>
                  <td>{row.passes.map((p) => `${fmtMs(p.ms)}@${p.resumedFrom}`).join(" ")}</td>
                  <td>{fmtMs(row.xdvMs)}</td><td>{fmtMs(row.fullEngineMs)} ({row.fullPasses})</td>
                  <td>{row.identicalXdv ? "yes" : "NO"}</td><td>{(row.checkpointBytes / 2 ** 20).toFixed(0)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </TableScroller>
      {/if}
      {#if accuracy.length > 0}
        <TableScroller>
          <table class="data-table data-table-compact mt-3" data-testid="spike-accuracy">
            <thead><tr><th>Group</th><th>exact</th><th>line only</th><th>template</th><th>wrong</th><th>none</th><th>Examples</th></tr></thead>
            <tbody>
              {#each accuracy as row (row.group)}
                <tr><td>{row.group}</td><td>{row.counts.exact}</td><td>{row.counts.lineOnly}</td><td>{row.counts.template}</td><td>{row.counts.wrong}</td><td>{row.counts.none}</td><td>{row.samples.join(", ")}</td></tr>
              {/each}
            </tbody>
          </table>
        </TableScroller>
      {/if}
      {#if init}
        <details class="mt-3 text-xs"><summary>{$t("texpressoSpike.initInfo")}</summary><pre class="whitespace-pre-wrap" data-testid="spike-init">{JSON.stringify(init, null, 1)}</pre></details>
      {/if}
      {#if reply?.log}
        <details class="mt-1 text-xs"><summary>{$t("texpressoSpike.log")}</summary><pre class="max-h-64 overflow-auto whitespace-pre-wrap">{reply.log.slice(-6000)}</pre></details>
      {/if}
    </div>
    <div class="flex min-w-0 flex-col gap-3" data-testid="spike-pages">
      {#if status === "failed" && pages.length === 0}<Alert severity="danger">{failure}</Alert>{/if}
      {#each pages as page, i (i)}
        <div class="relative w-full shadow-md" style={`aspect-ratio: ${page.widthMm} / ${page.heightMm}`}>
          <button type="button" class="block h-full w-full cursor-text p-0" onclick={(e) => void onPageClick(e, i)} aria-label={`Page ${i + 1}`}>
            <img src={page.url} alt="" class="pointer-events-none h-full w-full" draggable="false" />
          </button>
          {#if overlay && overlay.page === i + 1 && overlay.text}
            <span
              class="bg-warning text-warning-contrast pointer-events-none absolute rounded px-0.5 text-[0.7rem]"
              style={`left: ${(overlay.xMm / page.widthMm) * 100}%; top: ${(overlay.yMm / page.heightMm) * 100}%; transform: translateY(-100%)`}
              title={$t("texpressoSpike.provisional")}>{overlay.text}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</PageShell>
