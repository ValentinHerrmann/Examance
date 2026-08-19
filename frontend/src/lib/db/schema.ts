/**
 * IndexedDB schema type definitions for Dexie.
 *
 * SECURITY: All *_ct (ciphertext) fields are Uint8Array encrypted before IDB write.
 * Decryption happens at point of use only — never stored decrypted.
 *
 * Encryption-at-rest is the PRIMARY protection against data leakage on shared machines.
 * The IDB wipe in hygiene.ts is best-effort UX — not relied upon for security.
 */

export interface GradeCutoff {
  grade: string;      // e.g. "1", "2", "3", "4", "5", "6"
  label: string;      // e.g. "Sehr gut", "Gut", etc.
  minPercentage: number; // e.g. 90 (90%)
}

export interface GradingKeyConfig {
  preset: 'linear_50' | 'linear_40' | 'even_split' | 'custom';
  cutoffs: GradeCutoff[];
}

export interface ExamRecord {
  id: string;            // UUID
  teacherId: string;
  title?: string;
  testart?: string;
  grade?: string;
  klasse?: string;
  datum?: string;
  nr?: string;
  fach?: string;
  lehrernachname?: string;
  infoText?: string;
  latexPreamble?: string;
  latexTemplate?: string;
  numVersions?: number;
  gradingKey?: GradingKeyConfig;
  retentionUntil: string;  // ISO date string
  compilationStatus: 'pending' | 'compiled' | 'failed';
  createdAt: string;
  isDirty?: boolean;
  /** AES-256-GCM encrypted payload containing title, metadata, & LaTeX templates. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}

export interface ExerciseRecord {
  id: string;            // UUID
  teacherId?: string;
  examId?: string;
  orderIndex?: number;
  mcGroupId?: string;
  subIndex?: number;
  title?: string;
  name?: string;
  latexBody?: string;
  maxPoints: number;
  topicTag?: string;
  grade?: string;
  subject?: string;
  version?: number;
  exerciseGroupId?: string;
  variantKey?: string;
  isCurrent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  questionType: 'free_text' | 'mc' | 'sc' | 'tf';
  options?: string[];
  correctAnswers?: number[];
  penalty: number;
  /** AES-256-GCM encrypted payload containing title, name, latexBody, options, correctAnswers. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}

/**
 * A file attached to an exercise so its LaTeX can reference it by name
 * (`\includegraphics{figure.png}`, `\input{data.tex}`, ...).
 *
 * The bytes are AES-256-GCM encrypted (`dataCt`/`dataIv`) exactly like a scan;
 * `data` only holds plaintext bytes when no session key is available, mirroring
 * how the other encrypt helpers degrade. `filename`, `mimeType` and `byteSize`
 * stay in the clear because they are Dexie index/display fields.
 */
export interface ExerciseResourceRecord {
  id: string;            // UUID
  exerciseId: string;
  /** Sanitized, flat name referenced from the LaTeX source. Unique per exercise. */
  filename: string;
  mimeType: string;
  byteSize: number;
  createdAt?: string;
  /** AES-256-GCM ciphertext of the raw file bytes. */
  dataCt?: Uint8Array;
  /** 12-byte GCM IV for dataCt. */
  dataIv?: Uint8Array;
  /** Raw bytes — only set when the record was written without a session key. */
  data?: Uint8Array;
}

export interface ExamExerciseRecord {
  examId: string;
  exerciseId: string;
  orderIndex: number;
  /** UUID shared by all sub-exercises grouped into one MC Aufgabe block. */
  mcGroupId?: string;
  /** 1-based position within the MC group (a, b, c...). */
  subIndex?: number;
}

export interface ExamMcGroupRecord {
  id: string;          // groupId (UUID)
  examId: string;
  title: string;       // e.g. "Grundlagen"
  scoringText: string; // e.g. "Für jedes korrekte Kreuz 1BE; für jedes falsche -0,5BE. ..."
  orderIndex: number;  // position of this MC block in the exam
}

/** Provenance/confidence of an OMR-derived MC score, set by omrWorker.ts / cleared on manual edit. */
export interface OmrScoreMeta {
  confidence: 'high' | 'ambiguous' | 'failed';
  source: 'omr' | 'manual';
  /** Option indices the worker flagged as uncertain (light mark, partial erase, multi-mark on sc/tf). */
  flaggedOptions?: number[];
  /** Detected bubble boxes for the grading viewer to draw over the scan, for every option
   *  (including blank ones — needed to place the "missing" annotation on correct options the
   *  student didn't mark). Carried forward across manual `McAnswerReview` toggles — it
   *  documents what the scanner saw, which stays true after a correction. */
  detections?: {
    /** 0-based, matches OmrPageTemplate.pageIndex. */
    pageIndex: number;
    bubbles: {
      optionIndex: number;
      state: 'ambiguous' | 'marked' | 'blank' | 'undone' | 'redone';
      /** Normalized [minX, minY, maxX, maxY] in [0,1] of the scan page's (width, height). */
      rect: [number, number, number, number];
    }[];
  };
}

export interface ExerciseScoreRecord {
  id: string;               // UUID
  submissionId: string;
  exerciseId: string;
  score?: number;
  selectedOptions?: number[];
  omrMeta?: OmrScoreMeta;
  /** AES-256-GCM encrypted payload containing score, selectedOptions, and omrMeta. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}

export interface StudentRecord {
  /** Raw pseudonym UUID — only in local IDB, never sent to server. */
  pseudonymId: string;
  examId: string;
  /** Human-readable fallback code (e.g. "A-X7K2M9") for unreadable QR codes. */
  fallbackCode?: string;
  /** Decrypted student full name if available (e.g. "Erika Mustermann"). */
  studentName?: string;
  /** Decrypted student ID number if available (e.g. "123456"). */
  studentNumber?: string;
  /** AES-256-GCM ciphertext of PII (name, student number, etc.). */
  piiCt: Uint8Array;
  /** 12-byte GCM IV for piiCt. */
  piiIv: Uint8Array;
  /** AES-256-GCM encrypted payload containing fallbackCode, studentName, studentNumber. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}

export interface SubmissionRecord {
  id: string;            // UUID
  examId: string;
  /** HMAC(pseudonymId, archiveSecret) — links to StudentRecord without exposing raw ID. */
  pseudonymHash: string;
  totalScore?: number;
  /** AES-256-GCM ciphertext of scan PDF bytes (native PDF with preserved page structure). */
  scanCt?: Uint8Array;
  /** AES-256-GCM IV for scanCt. */
  scanIv?: Uint8Array;
  /** AES-256-GCM ciphertext of annotation JSON vector layer. */
  annotationCt?: Uint8Array;
  annotationIv?: Uint8Array;
  createdAt: string;
  /** AES-256-GCM encrypted payload containing totalScore. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}

/** One MC option bubble's location on a compiled exam page, in PDF points (72/in). */
export interface OmrBubbleRect {
  exerciseId: string;
  optionIndex: number;
  /** PDF user-space rect [x0, y0, x1, y1], origin bottom-left of the page. */
  rect: [number, number, number, number];
  /** Redo-zone rect immediately left of the box (PDF points), present only on exams
   *  compiled after undo/redo support was added. Absent → worker uses legacy 2-band logic. */
  redoRect?: [number, number, number, number];
}

/** One corner fiducial marker's location on a compiled exam page, in PDF points. */
export interface OmrFiducialRect {
  /** 0=bottom-left, 1=bottom-right, 2=top-right, 3=top-left. */
  corner: 0 | 1 | 2 | 3;
  rect: [number, number, number, number];
}

export interface OmrPageTemplate {
  pageIndex: number;
  pageWidthPt: number;
  pageHeightPt: number;
  fiducials: OmrFiducialRect[];
  bubbles: OmrBubbleRect[];
}

export interface OmrTemplatePayload {
  pages: OmrPageTemplate[];
}

export interface OmrTemplateRecord {
  /** Equal to examId — one template per exam. */
  id: string;
  examId: string;
  /** Hash of the ordered (exerciseId, questionType, options.length, correctAnswers, penalty)
   *  tuples this template was built from — used to detect a stale template after an
   *  answer-key edit. Never silently regenerated; the UI gates on a mismatch. */
  exercisesHash: string;
  createdAt: string;
  /** AES-256-GCM encrypted payload containing { pages: OmrPageTemplate[] }. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}

export interface AuditEntry {
  id: string;            // UUID
  action: 'LOGIN' | 'EXPORT' | 'DELETE' | 'VIEW' | 'EXTEND_RETENTION';
  targetId?: string;
  timestamp: string;     // ISO datetime
  note?: string;
  /** AES-256-GCM encrypted payload containing note. */
  payloadCt?: Uint8Array;
  /** 12-byte GCM IV for payloadCt. */
  payloadIv?: Uint8Array;
}
