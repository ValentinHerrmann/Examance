/**
 * Example data for a new account (issue #120): invented exercises, exams and graded booklets from the demo
 * instance, shipped as a plain archive payload in `static/example-data/` (built by docs/demo-instance/export-example.mjs).
 * It goes through the archive importer, so results follow the storage mode and are sealed under the live key.
 */
import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { collectHttpErrors } from '#lib/stores/httpErrorStore';
import { applyResolutions, type DecisionMap } from '#lib/archive/conflicts';
import { applyArchive, type ImportResult } from '#lib/archive/unpacker';
import { decodeBinary } from '#lib/archive/binary';
import { newReport } from '#lib/archive/report';
import { translate } from '#lib/i18n';

const BASE = '/example-data';
const RETENTION_DAYS = 365;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { cache: 'no-cache' });
  // The static host answers unknown paths with the SPA shell, so check the type too.
  if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error(translate('dashboard.exampleData.unavailable'));
  }
  return res;
}

/** Loads the bundled payload with its scans and gives every exam, exercise and MC group a fresh id. */
async function loadPayload(): Promise<Record<string, any>> {
  const raw = decodeBinary(await (await fetchOk(`${BASE}/example.json`)).json()) as Record<string, any>;
  for (const sub of raw.submissions ?? []) {
    if (!sub.scanFile) continue;
    sub.scanBytes = new Uint8Array(await (await fetchOk(`${BASE}/${sub.scanFile}`)).arrayBuffer());
    delete sub.scanFile;
  }

  // Import-as-copy for everything: many accounts on one server get the same example data.
  const decisions: DecisionMap = new Map();
  const copy = (kind: 'exam' | 'exercise' | 'mcGroup', rows: any[] | undefined) => {
    for (const row of rows ?? []) decisions.set(row.id, { id: row.id, kind, choice: 'import-as-copy' });
  };
  copy('exam', raw.exams);
  copy('exercise', raw.exercises);
  copy('mcGroup', raw.examMcGroups);
  const { payload } = applyResolutions(raw, decisions);
  // Submission and score ids are global keys on the server, and `applyArchive` keeps them when it
  // sees no exam id change (it cannot, the copy was made here).
  const submissionIds = new Map<string, string>();
  for (const sub of payload.submissions ?? []) {
    submissionIds.set(sub.id, crypto.randomUUID());
    sub.id = submissionIds.get(sub.id);
  }
  for (const score of payload.exerciseScores ?? []) {
    score.submissionId = submissionIds.get(score.submissionId) ?? score.submissionId;
    score.id = crypto.randomUUID();
  }

  const retentionUntil = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  const createdAt = new Date().toISOString();
  for (const exam of payload.exams ?? []) Object.assign(exam, { retentionUntil, createdAt });
  return payload;
}

/** Adds the example data to the open workspace. @throws when locked or the data cannot be loaded. */
export async function addExampleData(): Promise<ImportResult> {
  if (!get(sessionStore).sessionKey) throw new Error(translate('workspace.archive.lockedCannotImport'));
  const payload = await loadPayload();
  const report = newReport('import', translate('dashboard.exampleData.reportName'));
  const { result, errors } = await collectHttpErrors(() => applyArchive(payload, undefined, { report }));
  report.problems.push(...errors.map((e) => `HTTP ${e.status}${e.code ? ` ${e.code}` : ''}: ${e.message}`));
  return result;
}
