/**
 * Tunable parameters of the OMR (MC answer detection) pipeline — the single source of truth.
 *
 * `omrWorker.ts` reads every threshold from an `OmrDetectionParams` object passed in with each
 * request; nothing in the worker hardcodes them any more. Every detection stamps the exact
 * params it ran with into the sealed `omrMeta.run` of each score row (see `omrResult.ts`), so:
 *
 *  - changing settings only ever affects *future* runs — an existing detection keeps the
 *    snapshot it was produced with, and the verify page can compare that snapshot with what
 *    a re-run would use;
 *  - a future learner can pair each verified row's raw readings (`fillRatio`, `detectedState`)
 *    with the params and `OMR_ALGORITHM_VERSION` that produced them. A learned profile is just
 *    another `OmrSettingsProfile` with `source: 'learned'` — no shape change needed.
 *
 * Pure module: no DOM, no stores — the worker imports it.
 */

/** Bump whenever feature extraction or classification semantics change (not for param changes).
 *  1 = fill ratio only. 2 = + shape analysis (`omrShape.ts`: solid / spill / faint).
 *  3 = local threshold, border snapping, thin strokes, provisional readings, raster scale 3 —
 *      withdrawn: its area thresholds misread thin-pen crosses.
 *  4 = v3 measurement + stroke-based decision (`classifyV4`); redo-zone geometry fixed.
 *  Selectable per run via `params.algorithm` (2 or 4); the other is always computed alongside. */
export const OMR_ALGORITHM_VERSION = 4;

/** Algorithms a run can be decided by (`params.algorithm`). */
export const OMR_ALGORITHMS = [2, 4] as const;
export type OmrAlgorithm = (typeof OMR_ALGORITHMS)[number];

export interface OmrDetectionParams {
  /** Which algorithm decides (the other runs in the shadow for comparison). */
  algorithm: OmrAlgorithm;
  /** Fill ratio below this reads as blank. */
  ambiguousLow: number;
  /** Fill ratio at/above this reads as a confident mark (between the two: ambiguous). */
  markedHigh: number;
  /** At/above this a box counts as solid-filled ("undo") — only for boxes with a redo zone. */
  filledHigh: number;
  /** Redo-zone fill ratio at/above which a solid-filled box counts as re-marked. */
  redoMarkedHigh: number;
  /** Fraction of each side of a bubble's box trimmed off before counting fill (ignores the printed border). */
  sampleInsetFraction: number;
  /** Fraction of each page side searched for a corner fiducial. */
  quadrantFraction: number;
  /** Candidate fiducial blob area, as a multiple of the expected area: lower bound. */
  fiducialAreaMinRatio: number;
  /** Candidate fiducial blob area, as a multiple of the expected area: upper bound. */
  fiducialAreaMaxRatio: number;
  /** Maximum bbox aspect ratio for a fiducial candidate (it is a square marker). */
  fiducialMaxAspectRatio: number;
  /** Maximum distance of a fiducial from its expected position, as a fraction of the page's shorter side. */
  fiducialMaxDistFraction: number;
  /** 4-point registration: 4th-corner residual (fraction of scan width) above which alignment is "uncertain". */
  alignResidualFraction: number;
  /** Relative page aspect-ratio distortion above which alignment is "uncertain". */
  alignRatioTolerance: number;
  /** Allowed deviation of the mapped page corner angle from 90°, in degrees. */
  alignAngleToleranceDeg: number;
  /** Raster scale the scan is rendered at before detection. Not user-editable; snapshotted only. */
  scanScale: number;
  /** v2 shape analysis on/off (`omrShape.ts`). Off = exactly the v1 fill-ratio classification. */
  shapeAnalysis: boolean;
  /** Solid-fill check: minimum overall fill ratio… */
  solidFillMin: number;
  /** …and minimum fill of every 3×3 cell of the box (a cross/tick leaves cells empty)… */
  solidCellMin: number;
  /** …and minimum lowest÷highest cell fill (a bold cross is uneven, hatching is even). */
  solidEvennessMin: number;
  /** Outer edge of the ring measured around a box, as a fraction of the box size. */
  ringFraction: number;
  /** Ring ink above the sibling boxes' median at/above which a mark is flagged ("spill"). */
  spillExcessMax: number;
  /** Ink contrast (0 = at threshold, 1 = page black) below which a mark is flagged ("faint"). */
  faintContrastMin: number;
  /** Local ink threshold: a pixel is ink when darker than paper − this × (paper − print black). */
  localContrastFrac: number;
  /** How far (fraction of the box size) the window may be snapped onto the printed border. */
  snapMaxFraction: number;
  /** A blank box whose largest stroke spans at least this share of the box is flagged ("thin"). */
  strokeSpanMin: number;
  /** v4: below this interior ink fraction (and without a stroke) a box is blank. */
  inkMinFill: number;
  /** v4: a clean stroke spanning at least this share of the box is a confident tick. */
  tickSpanMin: number;
}

export type OmrParamKey = keyof OmrDetectionParams;
export type OmrNumericParamKey = {
  [K in OmrParamKey]: OmrDetectionParams[K] extends number ? (number extends OmrDetectionParams[K] ? K : never) : never;
}[OmrParamKey];

/** Built-in defaults. Changing one changes future runs only (each run snapshots its params). */
export const DEFAULT_OMR_PARAMS: Readonly<OmrDetectionParams> = Object.freeze({
  // v4 is the default since it read 36/36 verified boxes correctly (v2: 20/36) on the first
  // compared exam. v2 stays selectable, and the non-deciding algorithm keeps running alongside.
  algorithm: 4,
  ambiguousLow: 0.15,
  markedHigh: 0.45,
  filledHigh: 0.75,
  redoMarkedHigh: 0.45,
  sampleInsetFraction: 0.12,
  quadrantFraction: 0.4,
  fiducialAreaMinRatio: 0.3,
  fiducialAreaMaxRatio: 3.0,
  fiducialMaxAspectRatio: 1.8,
  fiducialMaxDistFraction: 0.15,
  alignResidualFraction: 0.015,
  alignRatioTolerance: 0.05,
  alignAngleToleranceDeg: 5,
  scanScale: 3.0,
  shapeAnalysis: true,
  solidFillMin: 0.5,
  solidCellMin: 0.3,
  solidEvennessMin: 0.5,
  ringFraction: 0.35,
  spillExcessMax: 0.12,
  faintContrastMin: 0.3,
  localContrastFrac: 0.35,
  snapMaxFraction: 0.3,
  strokeSpanMin: 0.25,
  inkMinFill: 0.03,
  tickSpanMin: 0.45,
});

export type OmrParamGroup = 'basic' | 'advanced' | 'fixed';

export type OmrParamSpec =
  | { kind: 'number'; key: OmrNumericParamKey; group: OmrParamGroup; min: number; max: number; step: number }
  | { kind: 'toggle'; key: 'shapeAnalysis'; group: OmrParamGroup }
  | { kind: 'choice'; key: 'algorithm'; group: OmrParamGroup; options: readonly OmrAlgorithm[] };

/** Display order + bounds. Drives both the settings UI and validation. */
export const OMR_PARAM_SPECS: readonly OmrParamSpec[] = [
  { kind: 'choice', key: 'algorithm', group: 'basic', options: OMR_ALGORITHMS },
  { kind: 'number', key: 'ambiguousLow', group: 'basic', min: 0.01, max: 0.9, step: 0.01 },
  { kind: 'number', key: 'markedHigh', group: 'basic', min: 0.02, max: 0.95, step: 0.01 },
  { kind: 'number', key: 'filledHigh', group: 'basic', min: 0.05, max: 1, step: 0.01 },
  { kind: 'number', key: 'redoMarkedHigh', group: 'basic', min: 0.05, max: 1, step: 0.01 },
  { kind: 'toggle', key: 'shapeAnalysis', group: 'basic' },
  { kind: 'number', key: 'sampleInsetFraction', group: 'advanced', min: 0, max: 0.4, step: 0.01 },
  { kind: 'number', key: 'quadrantFraction', group: 'advanced', min: 0.1, max: 0.5, step: 0.01 },
  { kind: 'number', key: 'fiducialAreaMinRatio', group: 'advanced', min: 0.05, max: 1, step: 0.05 },
  { kind: 'number', key: 'fiducialAreaMaxRatio', group: 'advanced', min: 1, max: 10, step: 0.1 },
  { kind: 'number', key: 'fiducialMaxAspectRatio', group: 'advanced', min: 1, max: 4, step: 0.1 },
  { kind: 'number', key: 'fiducialMaxDistFraction', group: 'advanced', min: 0.02, max: 0.5, step: 0.01 },
  { kind: 'number', key: 'alignResidualFraction', group: 'advanced', min: 0.001, max: 0.1, step: 0.001 },
  { kind: 'number', key: 'alignRatioTolerance', group: 'advanced', min: 0.005, max: 0.5, step: 0.005 },
  { kind: 'number', key: 'alignAngleToleranceDeg', group: 'advanced', min: 0.5, max: 30, step: 0.5 },
  { kind: 'number', key: 'solidFillMin', group: 'advanced', min: 0.2, max: 1, step: 0.01 },
  { kind: 'number', key: 'solidCellMin', group: 'advanced', min: 0.05, max: 1, step: 0.01 },
  { kind: 'number', key: 'solidEvennessMin', group: 'advanced', min: 0.1, max: 1, step: 0.05 },
  { kind: 'number', key: 'ringFraction', group: 'advanced', min: 0.15, max: 1, step: 0.05 },
  { kind: 'number', key: 'spillExcessMax', group: 'advanced', min: 0.01, max: 1, step: 0.01 },
  { kind: 'number', key: 'faintContrastMin', group: 'advanced', min: 0, max: 1, step: 0.05 },
  { kind: 'number', key: 'localContrastFrac', group: 'advanced', min: 0.1, max: 0.9, step: 0.05 },
  { kind: 'number', key: 'snapMaxFraction', group: 'advanced', min: 0, max: 0.5, step: 0.05 },
  { kind: 'number', key: 'strokeSpanMin', group: 'advanced', min: 0.1, max: 1, step: 0.05 },
  { kind: 'number', key: 'inkMinFill', group: 'advanced', min: 0, max: 0.3, step: 0.01 },
  { kind: 'number', key: 'tickSpanMin', group: 'advanced', min: 0.2, max: 1, step: 0.05 },
  { kind: 'number', key: 'scanScale', group: 'fixed', min: 1, max: 4, step: 0.5 },
];

/**
 * Params that only one algorithm's *decision* reads (`classifyV2` / `classifyV4` + `measureBox`).
 * Everything not listed here feeds both. The settings UI disables the others' controls.
 */
export const OMR_PARAM_ALGORITHM: Partial<Record<OmrParamKey, OmrAlgorithm>> = {
  ambiguousLow: 2,
  markedHigh: 2,
  shapeAnalysis: 2,
  solidFillMin: 2,
  inkMinFill: 4,
  tickSpanMin: 4,
  strokeSpanMin: 4,
  localContrastFrac: 4,
  snapMaxFraction: 4,
};

export type OmrParamsError =
  | { code: 'range'; key: OmrParamKey }
  | { code: 'fillOrder' }
  | { code: 'areaOrder' };

function isValidValue(spec: OmrParamSpec, value: unknown): boolean {
  if (spec.kind === 'toggle') return typeof value === 'boolean';
  if (spec.kind === 'choice') return (spec.options as readonly unknown[]).includes(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max;
}

/** Empty array = valid. */
export function validateOmrParams(p: OmrDetectionParams): OmrParamsError[] {
  const errors: OmrParamsError[] = [];
  for (const spec of OMR_PARAM_SPECS) {
    if (!isValidValue(spec, p[spec.key])) errors.push({ code: 'range', key: spec.key });
  }
  if (!(p.ambiguousLow < p.markedHigh && p.markedHigh < p.filledHigh)) errors.push({ code: 'fillOrder' });
  if (!(p.fiducialAreaMinRatio < p.fiducialAreaMaxRatio)) errors.push({ code: 'areaOrder' });
  return errors;
}

/**
 * Coerces anything (a stored/hand-edited value, a message payload, `undefined`) into a valid
 * params object. Never throws: out-of-range fields fall back to their default, and an order
 * violation resets the fields involved.
 */
export function normalizeOmrParams(input: unknown): OmrDetectionParams {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: OmrDetectionParams = { ...DEFAULT_OMR_PARAMS };
  for (const spec of OMR_PARAM_SPECS) {
    const v = src[spec.key];
    if (isValidValue(spec, v)) (out as unknown as Record<string, unknown>)[spec.key] = v;
  }
  if (!(out.ambiguousLow < out.markedHigh && out.markedHigh < out.filledHigh)) {
    out.ambiguousLow = DEFAULT_OMR_PARAMS.ambiguousLow;
    out.markedHigh = DEFAULT_OMR_PARAMS.markedHigh;
    out.filledHigh = DEFAULT_OMR_PARAMS.filledHigh;
  }
  if (!(out.fiducialAreaMinRatio < out.fiducialAreaMaxRatio)) {
    out.fiducialAreaMinRatio = DEFAULT_OMR_PARAMS.fiducialAreaMinRatio;
    out.fiducialAreaMaxRatio = DEFAULT_OMR_PARAMS.fiducialAreaMaxRatio;
  }
  return out;
}

/** Keys whose values differ (in `OMR_PARAM_SPECS` order). `a` may be an older run snapshot that
 *  lacks keys added since — a missing key counts as different, never as "the default". */
export function diffOmrParams(a: Partial<OmrDetectionParams>, b: OmrDetectionParams): OmrParamKey[] {
  return OMR_PARAM_SPECS.map((s) => s.key).filter((k) => a[k] !== b[k]);
}

/**
 * Where a params set came from. `'learned'` is reserved for a future profile fitted from
 * teacher verification — it must stay client-side and aggregate-only (no per-pupil rows).
 */
export type OmrSettingsSource = 'default' | 'user' | 'learned';

export interface OmrSettingsProfile {
  schemaVersion: 1;
  source: OmrSettingsSource;
  /** Monotonic, bumped on every save — lets a run snapshot name the exact profile state. */
  revision: number;
  algorithmVersion: number;
  params: OmrDetectionParams;
  updatedAt?: string;
}

export function defaultOmrProfile(): OmrSettingsProfile {
  return {
    schemaVersion: 1,
    source: 'default',
    revision: 0,
    algorithmVersion: OMR_ALGORITHM_VERSION,
    params: { ...DEFAULT_OMR_PARAMS },
  };
}

/** Provenance of one detection batch (an upload on the scan page, or a re-run). */
export interface OmrRunInfo {
  /** One UUID per batch — the verify page groups score rows by it. */
  runId: string;
  detectedAt: string;
  trigger: 'scan' | 'rerun';
  /** The algorithm that decided this run (`params.algorithm`: 2 or 4; 3 on withdrawn v3 runs). */
  algorithmVersion: number;
  /** `OMR_ALGORITHM_VERSION` at detection time — what the recorded features and verdicts mean.
   *  Absent on runs made before it was recorded (those were pipeline 3 or 4). */
  pipelineVersion?: number;
  settings: { source: OmrSettingsSource; revision: number };
  /** Full params at the time. Snapshots from older algorithm versions lack later keys. */
  params: OmrDetectionParams;
  /** `exercisesHash` of the OMR template the batch ran against. */
  templateHash?: string;
}

export function createOmrRun(
  trigger: OmrRunInfo['trigger'],
  profile: OmrSettingsProfile,
  templateHash?: string
): OmrRunInfo {
  const params = normalizeOmrParams(profile.params);
  return {
    runId: crypto.randomUUID(),
    detectedAt: new Date().toISOString(),
    trigger,
    // The deciding algorithm; the other one's verdict is kept per bubble as `alt`.
    algorithmVersion: params.algorithm,
    pipelineVersion: OMR_ALGORITHM_VERSION,
    settings: { source: profile.source, revision: profile.revision },
    params,
    ...(templateHash ? { templateHash } : {}),
  };
}

/** Per-page registration diagnostics returned by the worker and kept with each score row. */
export interface OmrPageStats {
  otsuThreshold: number;
  fiducialsFound: number;
  fiducialCorners: number[];
  /** 4th-corner residual as a fraction of scan width (4-fiducial pages only). */
  residualFraction?: number;
  /** Relative page aspect-ratio distortion (4-fiducial pages only). */
  ratioDiff?: number;
  /** Mapped top-left corner angle in degrees (4-fiducial pages only). */
  angleDeg?: number;
}
