import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  BookletCollector,
  OmrAccumulator,
  ingestScans,
  isPdfFile,
  type IngestDeps,
  type IngestProgress,
  type PdfPageRef,
  type QrResult,
} from "../src/lib/scan/ingest";
import { openScan } from "../src/lib/db/dbEncryption";
import { defaultOmrProfile } from "../src/lib/grading/omrSettings";
import type { OmrWorkerResponse } from "../src/lib/workers/omrWorker";

const { calls, saved } = vi.hoisted(() => ({
  calls: [] as string[],
  saved: {
    students: [] as any[],
    submissions: [] as any[],
    scores: [] as { examId: string; subId: string; scores: any[]; key: unknown }[],
  },
}));

// The real codecs (the scan is sealed bound to its submission, issue #178); only the saves are recorded.
vi.mock("../src/lib/db/dbEncryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/db/dbEncryption")>()),
  saveStudentEncrypted: vi.fn(async (student: any) => {
    calls.push(`student:${student.fallbackCode}`);
    saved.students.push(student);
  }),
  saveSubmissionEncrypted: vi.fn(async (sub: any) => {
    calls.push("submission");
    saved.submissions.push(sub);
  }),
}));

// The keyed pseudonym itself is covered in tests/crypto.test.ts; here it only has to reach both rows (issue #177).
vi.mock("../src/lib/services/pseudonymRekey", () => ({
  pseudonymFor: vi.fn(async (_examId: string, raw: string) => ({
    pseudonymHmac: `keyed:${raw}`,
    pseudonymVersion: 2,
    pseudonymRaw: raw,
    pseudonymBase: `base:${raw}`,
  })),
}));

vi.mock("../src/lib/repositories/scoreRepository", () => ({
  scoreRepository: {
    saveMany: vi.fn(async (examId: string, subId: string, scores: any[], key: unknown) => {
      calls.push(`scores:${scores.length}`);
      saved.scores.push({ examId, subId, scores, key });
    }),
  },
}));

// The fake document reports the real page count of the uploaded bytes, so no rendering is needed.
vi.mock("../src/lib/pdf/pdfjs", async () => {
  const { PDFDocument: Doc } = await import("pdf-lib");
  const page = {
    getViewport: () => ({ width: 2, height: 2 }),
    render: () => ({ promise: Promise.resolve() }),
    cleanup: () => {},
  };
  const open = async (data: Uint8Array) => ({ numPages: (await Doc.load(data)).getPageCount(), getPage: async () => page });
  return {
    loadPdfjs: async () => ({ getDocument: ({ data }: { data: Uint8Array }) => ({ promise: open(data), destroy: async () => {} }) }),
  };
});

async function pdfFile(name: string, pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return new File([(await doc.save()) as BlobPart], name, { type: "application/pdf" });
}

const qr = (pseudonymId: string, extra: Partial<QrResult> = {}): QrResult => ({
  type: "QR_RESULT",
  pseudonymId,
  version: "A",
  ...extra,
});

describe("isPdfFile", () => {
  it("accepts by mime type or by extension", () => {
    expect(isPdfFile({ name: "x.bin", type: "application/pdf" })).toBe(true);
    expect(isPdfFile({ name: "scan.pdf", type: "" })).toBe(true);
    expect(isPdfFile({ name: "scan.png", type: "image/png" })).toBe(false);
  });
});

describe("BookletCollector", () => {
  const ref = (index: number): PdfPageRef => ({ doc: {} as PdfPageRef["doc"], index });

  it("groups consecutive pages of one pseudonym and continues with QR-less pages", () => {
    const c = new BookletCollector();
    c.addPage(qr("a"), ref(0));
    c.addPage(null, ref(1));
    c.addPage(qr("a"), ref(2));
    expect(c.booklets).toHaveLength(1);
    expect(c.booklets[0].pageRefs.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("reopens an earlier booklet instead of duplicating it", () => {
    const c = new BookletCollector();
    c.addPage(qr("a"), ref(0));
    c.addPage(qr("b"), ref(1));
    const back = c.addPage(qr("a"), ref(2));
    expect(c.booklets.map((b) => b.pseudonymId)).toEqual(["a", "b"]);
    expect(back).toBe(c.booklets[0]);
    expect(c.booklets[0].pageRefs).toHaveLength(2);
  });

  it("opens an unmatched booklet when the first page has no QR, and keeps filling it", () => {
    const c = new BookletCollector();
    const first = c.addPage(null, ref(0));
    c.addPage(null, ref(1));
    expect(first.isUnmatched).toBe(true);
    expect(first.fallbackCode).toMatch(/^UNMATCHED-/);
    expect(first.pseudonymId).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.booklets).toHaveLength(1);
    expect(first.pageRefs).toHaveLength(2);
  });

  it("derives identity from a parsable QR, else the worker's fallback code, else a random F- code", () => {
    const c = new BookletCollector();
    const parsed = c.addPage(qr("Muster, Anna_4711", { fallbackCode: "ignored" }), ref(0));
    expect(parsed).toMatchObject({ studentName: "Muster, Anna", studentNumber: "4711", fallbackCode: "Muster, Anna" });

    const viaRaw = c.addPage(qr("opaque-id", { rawText: "BG:Beispiel, Ben_12:A" }), ref(1));
    expect(viaRaw).toMatchObject({ studentNumber: "12", fallbackCode: "Beispiel, Ben" });

    expect(c.addPage(qr("opaque-2", { fallbackCode: "FB-2" }), ref(2)).fallbackCode).toBe("FB-2");
    const bare = c.addPage(qr("opaque-3"), ref(3));
    expect(bare.fallbackCode).toMatch(/^F-/);
    expect(bare.studentName).toBeUndefined();
    expect(bare.isUnmatched).toBe(false);
  });
});

describe("OmrAccumulator", () => {
  const response = (over: Partial<Extract<OmrWorkerResponse, { type: "OMR_RESULT" }>> = {}) =>
    ({
      type: "OMR_RESULT",
      results: [{ exerciseId: "ex1" }, { exerciseId: "ex2" }],
      alignmentFailed: false,
      alignmentUncertain: false,
      fiducialsFound: 4,
      fiducialCorners: [0, 1, 2, 3],
      pageStats: { otsuThreshold: 100, fiducialsFound: 4, fiducialCorners: [0, 1, 2, 3] },
      ...over,
    }) as Extract<OmrWorkerResponse, { type: "OMR_RESULT" }>;

  it("keeps results per pseudonym across pages", () => {
    const acc = new OmrAccumulator();
    acc.add("a", response());
    acc.add("b", response({ results: [{ exerciseId: "ex3" } as any] }));
    acc.add("a", response());
    expect(acc.resultsFor("a")).toHaveLength(4);
    expect(acc.resultsFor("b").map((r) => r.result.exerciseId)).toEqual(["ex3"]);
    expect(acc.resultsFor("unknown")).toEqual([]);
  });

  it("summarises alignment failures, the weakest fiducial count and missing corners in order of discovery", () => {
    const acc = new OmrAccumulator();
    expect(acc.summary()).toEqual({ alignmentFailures: 0, minFiducialsFound: null, missingCorners: [] });
    acc.add("a", response({ alignmentFailed: true, fiducialsFound: 3, fiducialCorners: [0, 1, 3] }));
    acc.add("a", response({ alignmentFailed: true, fiducialsFound: 2, fiducialCorners: [1, 2] }));
    acc.add("a", response());
    expect(acc.summary()).toEqual({
      alignmentFailures: 2,
      minFiducialsFound: 2,
      missingCorners: ["top-right", "bottom-left", "top-left"],
    });
  });
});

describe("ingestScans", () => {
  let key: CryptoKey;

  beforeEach(async () => {
    calls.length = 0;
    saved.students.length = 0;
    saved.submissions.length = 0;
    saved.scores.length = 0;
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }) }),
      }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const omrOk: OmrWorkerResponse = {
    type: "OMR_RESULT",
    results: [
      { exerciseId: "ex1", pageIndex: 0, selectedOptions: [1], score: 1, confidence: "high", flaggedOptions: [], bubbles: [] },
    ],
    alignmentFailed: false,
    alignmentUncertain: false,
    fiducialsFound: 4,
    fiducialCorners: [0, 1, 2, 3],
    pageStats: { otsuThreshold: 90, fiducialsFound: 4, fiducialCorners: [0, 1, 2, 3] },
  };

  function makeDeps(overrides: Partial<IngestDeps> = {}) {
    // Pages 1 and 3 carry a QR ("Muster, Anna" then "Beispiel, Ben"); the rest read no QR.
    const qrAnswers: (QrResult | null)[] = [qr("Muster, Anna_1"), null, qr("Beispiel, Ben_2"), null];
    let qrCall = 0;
    const progress: IngestProgress[] = [];
    const deps: IngestDeps = {
      examId: "exam-1",
      getSessionKey: () => key,
      qrPool: {
        dispatch: vi.fn(async () => {
          const answer = qrAnswers[qrCall++];
          if (!answer) throw new Error("no QR");
          return answer;
        }),
      },
      omrPool: null,
      getOmrContext: () => null,
      omrSettings: defaultOmrProfile(),
      monitor: { checkMemoryHealth: vi.fn() },
      onProgress: (p) => progress.push(p),
      ...overrides,
    };
    return { deps, progress };
  }

  it("groups pages into booklets, saves student, submission and scores in order, and reports progress", async () => {
    const { deps, progress } = makeDeps();
    const files = [await pdfFile("a.pdf", 3), await pdfFile("b.pdf", 1)];

    const result = await ingestScans(files, deps);

    expect(result).toMatchObject({ fileCount: 2, pageCount: 4, bookletCount: 2, warnings: [] });
    expect(calls).toEqual(["student:Muster, Anna", "submission", "scores:0", "student:Beispiel, Ben", "submission", "scores:0"]);
    // The raw QR value goes only into the sealed identity; both rows carry the keyed pseudonym.
    expect(saved.students.map((s) => [s.pseudonymRaw, s.pseudonymHmac, s.examId, s.studentNumber])).toEqual([
      ["Muster, Anna_1", "keyed:Muster, Anna_1", "exam-1", "1"],
      ["Beispiel, Ben_2", "keyed:Beispiel, Ben_2", "exam-1", "2"],
    ]);
    expect(saved.submissions.map((s) => [s.pseudonymHmac, s.pseudonymVersion])).toEqual([
      ["keyed:Muster, Anna_1", 2],
      ["keyed:Beispiel, Ben_2", 2],
    ]);

    // The sealed scan is the assembled booklet: Anna got pages 1-2 of a.pdf, Ben page 3 plus b.pdf.
    const sealedPages = async (i: number) => {
      const { id, scanCt, scanIv } = saved.submissions[i];
      const bytes = await openScan(id, scanCt, scanIv, key);
      return (await PDFDocument.load(bytes)).getPageCount();
    };
    expect(await sealedPages(0)).toBe(2);
    expect(await sealedPages(1)).toBe(2);

    expect(progress.map((p) => [p.phase, p.progress])).toEqual([
      ["analyzing", 0],
      ["scanning", 13],
      ["scanning", 25],
      ["scanning", 38],
      ["scanning", 50],
      ["saving", 75],
      ["saving", 100],
    ]);
    expect(progress[1]).toMatchObject({ current: 1, total: 4, fileName: "a.pdf" });
    expect(progress[4]).toMatchObject({ current: 4, total: 4, fileName: "b.pdf" });
    expect(progress[5]).toMatchObject({ current: 1, total: 2, pages: 2 });
    expect(deps.monitor!.checkMemoryHealth).toHaveBeenCalledTimes(4);
  });

  it("stores the scan unsealed (zero IV) when no session key is held", async () => {
    const { deps } = makeDeps({ getSessionKey: () => null });
    await ingestScans([await pdfFile("a.pdf", 1)], deps);
    expect(saved.submissions[0].scanCt).toBeUndefined();
    expect(saved.submissions[0].scanIv).toEqual(new Uint8Array(12));
  });

  it("runs OMR on pages whose template has content, with one run snapshot for the whole upload", async () => {
    const omrDispatch = vi.fn(async () => omrOk);
    const { deps } = makeDeps({
      omrPool: { dispatch: omrDispatch },
      omrTemplateHash: "hash-1",
      getOmrContext: () => ({
        templatePages: [
          { pageIndex: 0, bubbles: [{} as any], fiducials: [] } as any,
          { pageIndex: 1, bubbles: [], fiducials: [] } as any, // blank template page: skipped
        ],
        answerKeys: [],
      }),
    });

    const result = await ingestScans([await pdfFile("a.pdf", 3)], deps);

    // Anna's page 1 (template page 0) is detected; her page 2 maps to the empty template page 1. Ben's page 3 is his booklet's page 0, so it is detected too.
    expect(omrDispatch).toHaveBeenCalledTimes(2);
    expect(result.omr).toEqual({ alignmentFailures: 0, minFiducialsFound: 4, missingCorners: [] });
    expect(saved.scores.map((s) => s.scores.length)).toEqual([1, 1]);
    const [annaScores, benScores] = saved.scores;
    expect(annaScores.subId).toBe(saved.submissions[0].id);
    expect(annaScores.scores[0].submissionId).toBe(annaScores.subId);
    const runs = [annaScores, benScores].map((s) => s.scores[0].omrMeta.run);
    expect(runs[0].runId).toBe(runs[1].runId);
    expect(runs[0]).toMatchObject({ trigger: "scan", templateHash: "hash-1" });
    expect(calls.filter((c) => c.startsWith("scores"))).toEqual(["scores:1", "scores:1"]);
  });

  it("records OMR failures per file and keeps going", async () => {
    const { deps } = makeDeps({
      omrPool: { dispatch: vi.fn().mockRejectedValue(new Error("worker died")) },
      getOmrContext: () => ({ templatePages: [{ pageIndex: 0, bubbles: [{} as any], fiducials: [] } as any], answerKeys: [] }),
    });
    const result = await ingestScans([await pdfFile("a.pdf", 1)], deps);
    expect(result.bookletCount).toBe(1);
    expect(result.warnings).toMatchObject([{ kind: "omrFailed", fileName: "a.pdf" }]);
  });

  it("skips unreadable PDFs and images with a warning but still counts the files", async () => {
    const { deps } = makeDeps();
    const broken = new File([new Uint8Array([1, 2, 3])], "broken.pdf", { type: "application/pdf" });
    const image = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });

    const result = await ingestScans([broken, image, await pdfFile("ok.pdf", 1)], deps);

    expect(result.fileCount).toBe(3);
    expect(result.bookletCount).toBe(1);
    expect(result.warnings.map((w) => [w.kind, w.fileName])).toEqual([
      ["pdfUnreadable", "broken.pdf"],
      ["unsupportedFile", "photo.png"],
    ]);
  });

  it("lets a storage failure propagate after the earlier booklets were saved", async () => {
    const { saveSubmissionEncrypted } = await import("../src/lib/db/dbEncryption");
    vi.mocked(saveSubmissionEncrypted)
      .mockImplementationOnce(async () => {
        calls.push("submission");
        return "";
      })
      .mockRejectedValueOnce(new Error("quota"));
    const { deps } = makeDeps();
    await expect(ingestScans([await pdfFile("a.pdf", 3)], deps)).rejects.toThrow("quota");
    expect(calls).toEqual(["student:Muster, Anna", "submission", "scores:0", "student:Beispiel, Ben"]);
  });
});
