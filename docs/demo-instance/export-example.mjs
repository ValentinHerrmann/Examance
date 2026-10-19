// Export the in-app example data (issue #120) from a seeded demo instance: m.berger's own library, exam 10b
// (a few scanned, graded booklets incl. the annotated showcase) and the paper-graded 9c, as a plain archive
// payload in frontend/static/example-data/. Run after setup.sh (or at least seed-results.mjs for 10b and 9c).
import fs from 'node:fs';
import path from 'node:path';
import { open, login, BASE, ROOT, readState } from './lib.mjs';

const OUT = path.join(ROOT, 'frontend/static/example-data');
const KEEP_EXAMS = ['10b', '9c'];
const SCANNED_BOOKLETS = 8;

const ids = readState('exams.json', {});
const keepExamIds = new Set(KEEP_EXAMS.map((k) => ids[k]).filter(Boolean));
if (keepExamIds.size !== KEEP_EXAMS.length) throw new Error(`exams not seeded: ${KEEP_EXAMS.join(', ')}`);

const { ctx, page } = await open({ profile: 'berger' });
await login(page, 'berger');
await page.goto(BASE + '/');
await page.waitForTimeout(4000);

// The dev server serves the app's own modules: pack as the app does, then open the envelope again.
const json = await page.evaluate(async () => {
  const { packProject } = await import('/src/lib/archive/packer.ts');
  const { decryptArchive } = await import('/src/lib/archive/unpacker.ts');
  const { encodeBinary } = await import('/src/lib/archive/binary.ts');
  const password = 'example-data-export';
  const { blob } = await packProject(password);
  const payload = await decryptArchive(new Uint8Array(await blob.arrayBuffer()), password);
  return JSON.stringify(encodeBinary(payload));
});
await ctx.close();
const all = JSON.parse(json);

const exams = all.exams.filter((e) => keepExamIds.has(e.id));
const links = all.exerciseExams.filter((j) => keepExamIds.has(j.examId));
const linked = new Set(links.map((j) => j.exerciseId));
// Own library only: no copies of the colleague's shared exercises, no superseded versions nobody links.
const exercises = all.exercises.filter(
  (x) => !x.groupCopied && !x.examId && (linked.has(x.id) || x.isCurrent !== false)
);
const exerciseIds = new Set(exercises.map((x) => x.id));
if ([...linked].some((id) => !exerciseIds.has(id))) throw new Error('a kept exam links an exercise that was dropped');

// 10b: the annotated showcase plus booklets spread over the score range; 9c: the whole paper class.
const scannedExam = ids['10b'];
const scanned = all.submissions
  .filter((s) => s.examId === scannedExam && s.scanBytes)
  .sort((a, b) => (a.totalScore ?? 0) - (b.totalScore ?? 0));
const showcase = scanned.filter((s) => s.annotationBytes);
const rest = scanned.filter((s) => !s.annotationBytes);
const step = rest.length / Math.max(1, SCANNED_BOOKLETS - showcase.length);
const picked = [...showcase, ...Array.from({ length: SCANNED_BOOKLETS - showcase.length }, (_, i) => rest[Math.floor(i * step)])]
  .filter(Boolean);
const submissions = [...picked, ...all.submissions.filter((s) => s.examId === ids['9c'])];
const keptSubs = new Set(submissions.map((s) => s.id));
const keptPseudonyms = new Set(submissions.map((s) => `${s.examId}|${s.pseudonymHash}`));
const students = all.students.filter((s) => keptPseudonyms.has(`${s.examId}|${s.pseudonymId}`));
const exerciseScores = all.exerciseScores.filter((sc) => keptSubs.has(sc.submissionId));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'scans'), { recursive: true });
let n = 0;
for (const sub of submissions) {
  if (!sub.scanBytes) continue;
  sub.scanFile = `scans/${String(++n).padStart(2, '0')}.pdf`;
  fs.writeFileSync(path.join(OUT, sub.scanFile), Buffer.from(sub.scanBytes.$b64, 'base64'));
  delete sub.scanBytes;
}

const strip = ({ teacherId, isPublic, isShared, sharedAt, groupCopied, accountLatexPackages, payloadCt, payloadIv, ...rest }) => rest;
const payload = {
  payloadVersion: all.payloadVersion,
  codeWithheld: false,
  exams: exams.map((e) => strip({ ...e, title: `Beispiel: ${e.title}` })),
  exercises: exercises.map(strip),
  students,
  submissions,
  exerciseScores,
  exerciseExams: links,
  examMcGroups: all.examMcGroups.filter((g) => keepExamIds.has(g.examId)),
  exerciseResources: (all.exerciseResources ?? []).filter((r) => exerciseIds.has(r.exerciseId)),
  examLogos: (all.examLogos ?? []).filter((l) => keepExamIds.has(l.examId)),
};
fs.writeFileSync(path.join(OUT, 'example.json'), JSON.stringify(payload, null, 1) + '\n');
console.log(
  `example data: ${payload.exams.length} exams, ${payload.exercises.length} exercises, ${students.length} students, ` +
    `${submissions.length} submissions (${n} scanned), ${exerciseScores.length} scores -> ${path.relative(ROOT, OUT)}`
);
