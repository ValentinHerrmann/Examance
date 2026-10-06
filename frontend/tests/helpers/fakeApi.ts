/**
 * A stateful in-memory fake of the Examance API (`/api/v1`), shared by the vitest archive tests
 * (`fakeServer.ts`, which mocks `lib/api/client`) and the Playwright suite (`e2e/helpers/backend.ts`,
 * which answers the browser's requests with it). Exams and exercises always live on the server since
 * local mode was discontinued (issue #47), and every sign-in needs the auth, key-envelope and
 * capabilities routes, so neither suite can run without a backend.
 *
 * Framework-free on purpose: no vitest, no Playwright, no app imports. `handle()` takes what the
 * client sends (method, path relative to `/api/v1` including the query string, parsed JSON body) and
 * returns what the server would answer. Responses are snake_case like the real API, so the
 * repositories' mappers run unchanged. Blobs the client seals (scans, scores, student identities,
 * key envelopes) are stored opaquely and echoed back. Shapes follow `backend/app/schemas/*.py`.
 *
 * A request that no route matches answers 404 and is recorded in `state.unhandled`; the e2e
 * `backend` fixture fails the test on any such entry, so a missing endpoint reads as a gap in this
 * fake and not as an app bug. A *domain* 404 (unknown exam, exercise, ...) is a normal answer.
 */

export type FakeStorageMode = 'all-server' | 'hybrid';

export interface FakeApiOptions {
  /** The account's initial storage mode; `null` is an account that has not chosen one yet. Default `'all-server'`. */
  storageMode?: FakeStorageMode | null;
}

export interface FakeResponse {
  status: number;
  body?: unknown;
  /** Extra response headers; errors carry the machine-readable `code` here, like the real backend. */
  headers?: Record<string, string>;
  /** Raw bytes for the binary endpoints (resource download); `body` is unused then. */
  bytes?: Uint8Array;
}

export interface Link {
  exercise_id: string;
  order_index?: number;
  mc_group_id?: string | null;
  sub_index?: number | null;
}

export interface FakeApiState {
  exams: Map<string, any>;
  exercises: Map<string, any>;
  /** Exam id to its exercise links (the `exam_exercises` junction rows). */
  links: Map<string, Link[]>;
  /** Exam id to its MC groups as sent by the client. */
  mcGroups: Map<string, any[]>;
  resources: any[];
  /** Exercise groups by id (variants and versions of one exercise share one). */
  groups: Map<string, any>;
  /** Exam id to its student identity blobs. */
  students: Map<string, any[]>;
  /** Exam id to its scan submissions. */
  submissions: Map<string, any[]>;
  /** Submission id to its per-exercise score rows. */
  scores: Map<string, any[]>;
  /** The key-envelope set last stored by `PUT /keys/envelopes`. */
  envelopes: { keyId: string | null; rows: any[] };
  /** The account's storage mode as the server records it. */
  storageMode: FakeStorageMode | null;
  /** Email of the last sign-in. */
  email: string;
  /** Role the sign-in reports; set `'admin'` before signing in to open the admin pages. */
  role: 'teacher' | 'admin';
  /** Accounts and always-allowed domains the admin page lists (`/admin/*`). */
  adminUsers: any[];
  adminDomains: any[];
  /** Exercises that exist but belong to another account and are private: `GET /exercises/:id` answers 404, like `get_readable_exercise`. */
  hiddenExerciseIds: Set<string>;
  /** Every request seen, `"METHOD /path"`, in order. */
  requests: string[];
  /** Requests no route matched (see the file header). */
  unhandled: string[];
}

export interface FakeApi {
  state: FakeApiState;
  handle(method: string, path: string, body?: unknown): FakeResponse;
  /** Back to the initial state, in place (the `state` object and its maps stay the same instances). */
  reset(): void;
}

/** The one teacher account every sign-in resolves to. It is bound into the key envelopes as AAD, so it must never change. */
export const FAKE_TEACHER_ID = 'e2e-teacher';
const DEFAULT_EMAIL = 'teacher@e2e.example';
/** Constant: the client pins a fingerprint of the stored envelopes, so their server fields must be stable. */
const FIXED_TIME = '2026-01-01T00:00:00.000Z';
const ALLOWED_MODES: FakeStorageMode[] = ['all-server', 'hybrid'];

type Handled = FakeResponse | undefined;

const ok = (body?: unknown): FakeResponse => ({ status: 200, body });
const NO_LOGO = { source: 'none', mime_type: null, byte_size: 0, updated_at: null };
const created = (body?: unknown): FakeResponse => ({ status: 201, body });
const noContent = (): FakeResponse => ({ status: 204 });
const fail = (status: number, detail: string, code = 'ERR_UNKNOWN'): FakeResponse => ({
  status,
  body: { detail },
  headers: { code },
});
const notFound = (detail: string): FakeResponse => fail(404, detail, 'ERR_NOT_FOUND');
const conflict = (detail: string): FakeResponse => fail(409, detail, 'ERR_CONFLICT');

const uuid = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

/** `\begin{Aufgabe}[N]` override, else `\BE`/`\Lmulti` 1, `\hBE` 0.5, `\qBE` 0.25 (`parse_exercise_score` in the backend). */
function parseExerciseScore(latex: string | null | undefined): number {
  if (!latex) return 0;
  const override = /\\begin\{Aufgabe\}\[([\d.]+)\]/.exec(latex);
  if (override) {
    const parsed = parseFloat(override[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const count = (re: RegExp) => (latex.match(re) ?? []).length;
  return count(/\\BE\b/g) + count(/\\Lmulti\b/g) + count(/\\hBE\b/g) * 0.5 + count(/\\qBE\b/g) * 0.25;
}

/** Decoded byte length of a base64 string. */
function base64Length(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** `base` overlaid with `over`, skipping undefined values (JSON would drop them; direct callers would not). */
function withDefaults<T extends object>(base: T, over: Record<string, any>): T {
  const out: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(over)) if (value !== undefined) out[key] = value;
  return out as T;
}

/** Accounts the admin page lists: one pending registration, one active teacher, one open invitation (long addresses on purpose). */
function seedAdminUsers(): any[] {
  const all = { server_results: true, server_latex: true };
  return [
    { id: 'u-pending', email: 'very.long.firstname.lastname@grundschule-am-beispielweg.example', role: 'teacher', created_at: '2026-10-01T08:00:00Z', approved_at: null, registration_note: 'Mathematik und Physik, Klasse 9b — bitte freischalten.', features: all, password_set: true },
    { id: 'u-active', email: 'teacher@e2e.example', role: 'teacher', created_at: '2026-09-01T08:00:00Z', approved_at: '2026-09-01T08:00:00Z', registration_note: null, features: all, password_set: true },
    { id: 'u-invited', email: 'neue.kollegin.mit.langem.namen@gymnasium-beispielstadt.example', role: 'admin', created_at: '2026-09-20T08:00:00Z', approved_at: '2026-09-20T08:00:00Z', registration_note: null, features: { server_results: false, server_latex: true }, password_set: false },
  ];
}

function seedAdminDomains(): any[] {
  return [
    { id: 'd-1', domain: 'gymnasium-beispielstadt.example', features: { server_results: true, server_latex: false }, created_at: '2026-09-01T08:00:00Z' },
  ];
}

export function createFakeApi(opts: FakeApiOptions = {}): FakeApi {
  const initialMode = (): FakeStorageMode | null => (opts.storageMode === undefined ? 'all-server' : opts.storageMode);

  const state: FakeApiState = {
    exams: new Map(),
    exercises: new Map(),
    links: new Map(),
    mcGroups: new Map(),
    resources: [],
    groups: new Map(),
    students: new Map(),
    submissions: new Map(),
    scores: new Map(),
    envelopes: { keyId: null, rows: [] },
    storageMode: initialMode(),
    email: DEFAULT_EMAIL,
    role: 'teacher',
    adminUsers: seedAdminUsers(),
    adminDomains: seedAdminDomains(),
    hiddenExerciseIds: new Set(),
    requests: [],
    unhandled: [],
  };

  function reset(): void {
    state.exams.clear();
    state.exercises.clear();
    state.links.clear();
    state.mcGroups.clear();
    state.resources = [];
    state.groups.clear();
    state.students.clear();
    state.submissions.clear();
    state.scores.clear();
    state.envelopes = { keyId: null, rows: [] };
    state.storageMode = initialMode();
    state.email = DEFAULT_EMAIL;
    state.role = 'teacher';
    state.adminUsers = seedAdminUsers();
    state.adminDomains = seedAdminDomains();
    state.hiddenExerciseIds.clear();
    state.requests.length = 0;
    state.unhandled.length = 0;
  }

  /* ------------------------------------------------------------------------ */
  /* Auth, keys, user                                                          */
  /* ------------------------------------------------------------------------ */

  const authStep = () => ({
    id: FAKE_TEACHER_ID,
    email: state.email,
    role: state.role,
    status: 'ok',
    satisfied: ['password', 'totp'],
    available: ['password', 'totp'],
  });

  function auth(method: string, parts: string[], body: any): Handled {
    const [, action, step] = parts;
    // Self-registration: every completion waits for an admin.
    if (action === 'register') {
      if (method === 'POST' && step === 'complete') return ok({ status: 'pending' });
      if (method === 'POST') return ok({ message: 'If this address can be registered, a link was sent.' });
    }
    if (method !== 'POST') return undefined;
    // Self-deletion link: any token previews the signed-in address and deletes on confirm.
    if (action === 'account-deletion') {
      if (step === 'preview') return ok({ email: state.email, keep_exercises: false, expires_at: '2099-01-01T00:00:00Z' });
      if (step === 'confirm') return ok({ status: 'ok', account_deleted: true, kept_exercises: false });
    }
    if (action === 'login') {
      // Any credentials are accepted: the suite tests the app, not the login policy.
      state.email = String(body?.email ?? DEFAULT_EMAIL).trim().toLowerCase();
      return ok(authStep());
    }
    if (action === 'refresh') return ok(authStep());
    if (action === 'logout') return noContent();
    return undefined;
  }

  const envelopeList = () => ({
    key_id_b64: state.envelopes.keyId,
    envelopes: state.envelopes.rows,
  });

  function keys(method: string, parts: string[], body: any): Handled {
    const [, resource, id] = parts;
    if (resource !== 'envelopes') return undefined;
    if (!id && method === 'GET') return ok(envelopeList());
    if (!id && method === 'PUT') {
      const previous = state.envelopes.rows;
      state.envelopes = {
        keyId: body.key_id_b64,
        // A wrap that is stored again keeps its server-assigned id and timestamp.
        rows: (body.envelopes ?? []).map((env: any) => {
          const before = previous.find(
            (row) => row.kind === env.kind && (row.credential_id_b64 ?? null) === (env.credential_id_b64 ?? null),
          );
          return {
            ...env,
            credential_id_b64: env.credential_id_b64 ?? null,
            id: before?.id ?? uuid(),
            key_id_b64: body.key_id_b64,
            envelope_version: body.envelope_version ?? 1,
            invalidated_at: null,
            created_at: before?.created_at ?? FIXED_TIME,
          };
        }),
      };
      return ok(envelopeList());
    }
    if (id && method === 'DELETE') {
      if (!state.envelopes.rows.some((row) => row.id === id)) return notFound('Envelope not found.');
      state.envelopes.rows = state.envelopes.rows.filter((row) => row.id !== id);
      return noContent();
    }
    return undefined;
  }

  const capabilities = () => ({
    account_id: FAKE_TEACHER_ID,
    storage_mode: state.storageMode,
    allowed_storage_modes: [...ALLOWED_MODES],
    features: { server_results: true, server_latex: true, training_donation: true },
  });

  function user(method: string, parts: string[], body: any): Handled {
    const [, action] = parts;
    if (method === 'GET' && action === 'capabilities') return ok(capabilities());
    if (method === 'POST' && action === 'me' && parts[2] === 'deletion-request') {
      return ok({ status: 'sent', expires_in_minutes: 60 });
    }
    if (action === 'logo') {
      // No default logo file in the fake: the account prints none until it uploads one (issue #46).
      if (method === 'GET' && parts.length === 2) return ok({ ...NO_LOGO, mode: 'default' });
      if (method === 'GET' && parts[2] === 'file') return notFound('No logo.');
      if (method === 'PUT') {
        const custom = body?.mode === 'custom';
        return ok({ ...NO_LOGO, mode: body?.mode ?? 'default', ...(custom ? { source: 'account', mime_type: 'image/png', byte_size: 1 } : {}) });
      }
      if (method === 'DELETE') return ok({ ...NO_LOGO, mode: 'default' });
    }
    if (method === 'PUT' && action === 'storage-mode') {
      if (!ALLOWED_MODES.includes(body?.mode)) {
        return fail(403, 'This storage mode is not enabled for your account.', 'ERR_STORAGE_MODE_NOT_ALLOWED');
      }
      if (state.storageMode !== (body.expected ?? null)) {
        return fail(409, 'The storage mode was changed elsewhere.', 'ERR_STORAGE_MODE_CHANGED');
      }
      state.storageMode = body.mode;
      return ok(capabilities());
    }
    if (method === 'POST' && action === 'purge-server-student-data') {
      let students = 0;
      let submissions = 0;
      for (const examId of state.exams.keys()) {
        students += state.students.get(examId)?.length ?? 0;
        submissions += state.submissions.get(examId)?.length ?? 0;
        for (const sub of state.submissions.get(examId) ?? []) state.scores.delete(sub.id);
        state.students.delete(examId);
        state.submissions.delete(examId);
      }
      return ok({ status: 'ok', purged_student_identities: students, purged_submissions: submissions });
    }
    return undefined;
  }

  /** Security settings page: a fully enrolled account with no passkeys. */
  function mfa(method: string, parts: string[]): Handled {
    if (method === 'GET' && parts[1] === 'status') {
      return ok({
        enrolled: ['password', 'totp'],
        key_capable: ['password'],
        required_factor_count: 2,
        complete: true,
        remaining_backup_codes: 8,
        has_recovery_code: true,
        recovery_created_at: FIXED_TIME,
        password_changed_at: null,
        password_last_used_at: null,
        totp_created_at: FIXED_TIME,
        totp_last_used_at: null,
      });
    }
    return undefined;
  }

  function webauthn(method: string, parts: string[]): Handled {
    if (method === 'GET' && parts[1] === 'credentials') return ok({ credentials: [] });
    return undefined;
  }

  function training(method: string, parts: string[]): Handled {
    if (method === 'GET' && parts[1] === 'status') return ok({ enabled: false, retention_days: null });
    return undefined;
  }

  /* ------------------------------------------------------------------------ */
  /* Exercises                                                                 */
  /* ------------------------------------------------------------------------ */

  const exerciseResponse = (ex: any): Record<string, any> =>
    withDefaults<Record<string, any>>(
      {
        teacher_id: FAKE_TEACHER_ID,
        name: null as string | null,
        topic_tag: null,
        grade: null,
        subject: null,
        latex_body: '' as string | null,
        code_withheld: false,
        max_points: 0,
        version: 1,
        exercise_group_id: null,
        variant_key: null,
        is_current: true,
        order_index: 1,
        question_type: 'free_text',
        correct_answers: null,
        penalty: 0,
        mc_group_id: null,
        sub_index: null,
      },
      ex,
    );

  /**
   * The group of an exercise being created. A known id adopts the group's metadata. An unknown id is
   * created on the spot: the real backend answers 404, but the archive tests hand in ids of groups
   * that only exist in their IndexedDB fixtures.
   */
  function resolveGroup(groupId: string | null | undefined, meta: any): any {
    const existing = groupId ? state.groups.get(groupId) : undefined;
    if (existing) return existing;
    const group = {
      id: groupId || uuid(),
      teacher_id: FAKE_TEACHER_ID,
      name: meta.name || 'Untitled Group',
      topic_tag: meta.topic_tag ?? null,
      grade: meta.grade ?? null,
      subject: meta.subject ?? null,
      created_at: now(),
    };
    state.groups.set(group.id, group);
    return group;
  }

  /** Adds an exercise row under a group, with the group's metadata, like `create_exercise` and its siblings. */
  function addExercise(group: any, fields: Record<string, any>): any {
    const id = fields.id ?? uuid();
    const exercise = {
      version: 1,
      is_current: true,
      question_type: 'free_text',
      correct_answers: null,
      penalty: 0,
      order_index: 1,
      ...fields,
      id,
      teacher_id: FAKE_TEACHER_ID,
      name: group.name,
      topic_tag: group.topic_tag,
      grade: group.grade,
      subject: group.subject,
      exercise_group_id: group.id,
    };
    state.exercises.set(id, exercise);
    return exercise;
  }

  function createExercise(body: any): FakeResponse {
    if (body.id && state.exercises.has(body.id)) return conflict('An exercise with this id already exists.');
    const group = resolveGroup(body.exercise_group_id, body);
    const withheld = body.code_withheld ?? false;
    const exercise = addExercise(group, {
      ...body,
      latex_body: withheld ? null : (body.latex_body ?? ''),
      code_withheld: withheld,
      max_points: body.latex_body ? parseExerciseScore(body.latex_body) : (body.max_points ?? 0),
    });
    return created(exerciseResponse(exercise));
  }

  const EXERCISE_FIELDS = [
    'name',
    'topic_tag',
    'grade',
    'subject',
    'latex_body',
    'variant_key',
    'question_type',
    'correct_answers',
    'penalty',
  ] as const;

  function updateExercise(id: string, body: any): FakeResponse {
    const exercise = state.exercises.get(id);
    if (!exercise) return notFound('Exercise not found');
    for (const field of EXERCISE_FIELDS) if (body[field] != null) exercise[field] = body[field];
    // Points follow the LaTeX only when there is some (an empty body must not zero the score scale).
    if (body.latex_body) exercise.max_points = parseExerciseScore(body.latex_body);
    else if (body.max_points != null) exercise.max_points = body.max_points;
    if (body.exercise_group_id != null) exercise.exercise_group_id = body.exercise_group_id;

    // Group metadata is shared by every variant and version: changing it cascades.
    const meta = ['name', 'topic_tag', 'grade', 'subject'].filter((field) => body[field] != null);
    if (exercise.exercise_group_id && meta.length > 0) {
      const group = state.groups.get(exercise.exercise_group_id);
      for (const field of meta) if (group) group[field] = body[field];
      for (const sister of state.exercises.values()) {
        if (sister.exercise_group_id === exercise.exercise_group_id) {
          for (const field of meta) sister[field] = body[field];
        }
      }
    }
    return ok(exerciseResponse(exercise));
  }

  function copyResources(sourceId: string, targetId: string): void {
    const copies = state.resources
      .filter((row) => row.exercise_id === sourceId)
      .map((row) => ({ ...row, id: uuid(), exercise_id: targetId }));
    state.resources.push(...copies);
  }

  /** The group of an exercise that is about to get a version or a variant (made on demand for old rows). */
  function groupOf(exercise: any): any {
    const group = resolveGroup(exercise.exercise_group_id, exercise);
    exercise.exercise_group_id = group.id;
    return group;
  }

  function newVersion(id: string, body: any): FakeResponse {
    const old = state.exercises.get(id);
    if (!old) return notFound('Exercise not found');
    old.is_current = false;
    const group = groupOf(old);
    const latex = body.latex_body ?? old.latex_body;
    const next = addExercise(group, {
      latex_body: latex,
      max_points: latex ? parseExerciseScore(latex) : old.max_points,
      version: old.version + 1,
      variant_key: body.variant_key || old.variant_key,
      question_type: old.question_type,
      correct_answers: old.correct_answers,
      penalty: old.penalty,
    });
    // `name`, `topic_tag`, ... of the body override the group's for this version only.
    for (const field of ['name', 'topic_tag', 'grade', 'subject'] as const) if (body[field] != null) next[field] = body[field];
    copyResources(old.id, next.id);
    return created(exerciseResponse(next));
  }

  function newVariant(id: string, body: any): FakeResponse {
    const base = state.exercises.get(id);
    if (!base) return notFound('Exercise not found');
    const group = groupOf(base);
    const variant = addExercise(group, {
      latex_body: body.latex_body ?? null,
      max_points: body.latex_body ? parseExerciseScore(body.latex_body) : (body.max_points ?? 0),
      variant_key: body.variant_key ?? null,
      question_type: base.question_type,
      correct_answers: base.correct_answers,
      penalty: base.penalty,
    });
    copyResources(base.id, variant.id);
    return created(exerciseResponse(variant));
  }

  function updateGroup(id: string, body: any): FakeResponse {
    const group = state.groups.get(id);
    if (!group) return notFound('Exercise group not found');
    const meta = ['name', 'topic_tag', 'grade', 'subject'].filter((field) => body[field] != null);
    for (const field of meta) group[field] = body[field];
    for (const exercise of state.exercises.values()) {
      if (exercise.exercise_group_id === id) for (const field of meta) exercise[field] = body[field];
    }
    return ok(group);
  }

  function usage(id: string): FakeResponse {
    if (!state.exercises.has(id)) return notFound('Exercise not found');
    const exams = [...state.exams.values()].filter((exam) =>
      (state.links.get(exam.id) ?? []).some((link) => link.exercise_id === id),
    );
    return ok({
      exam_count: exams.length,
      exams: exams.map((exam) => ({ id: exam.id, title: exam.title, datum: exam.datum ?? null })),
    });
  }

  function deleteExercise(id: string): FakeResponse {
    // Idempotent, like the real endpoint: an unknown id is already the requested state.
    state.exercises.delete(id);
    for (const [examId, links] of state.links) {
      state.links.set(examId, links.filter((link) => link.exercise_id !== id));
    }
    state.resources = state.resources.filter((row) => row.exercise_id !== id);
    return noContent();
  }

  function listExercises(query: URLSearchParams): FakeResponse {
    const groupId = query.get('group_id');
    const currentOnly = query.get('current_only') !== 'false';
    const search = query.get('search')?.toLowerCase();
    const rows = [...state.exercises.values()].filter((ex) => {
      if (currentOnly && ex.is_current === false) return false;
      if (groupId && ex.exercise_group_id !== groupId) return false;
      for (const field of ['topic_tag', 'grade', 'subject']) {
        const wanted = query.get(field);
        if (wanted && ex[field] !== wanted) return false;
      }
      if (search) {
        const haystack = [ex.name, ex.latex_body, ex.topic_tag, ex.grade, ex.subject, ex.variant_key];
        if (!haystack.some((value) => String(value ?? '').toLowerCase().includes(search))) return false;
      }
      return true;
    });
    return ok(rows.map(exerciseResponse));
  }

  const resourceMeta = (row: any) => {
    const { content_b64: _content, ...meta } = row;
    return meta;
  };

  function resourceRoutes(method: string, exerciseId: string, rest: string[], body: any): Handled {
    const [resourceId] = rest;
    const rows = state.resources.filter((row) => row.exercise_id === exerciseId);
    if (!resourceId) {
      if (method === 'GET') {
        return ok([...rows].sort((a, b) => a.filename.localeCompare(b.filename)).map(resourceMeta));
      }
      if (method === 'POST') {
        const existing = rows.find((row) => row.filename === body.filename);
        const content = body.content_b64 ?? '';
        if (existing) {
          Object.assign(existing, {
            mime_type: body.mime_type ?? 'application/octet-stream',
            byte_size: base64Length(content),
            content_b64: content,
          });
          return created(resourceMeta(existing));
        }
        const row = {
          id: uuid(),
          exercise_id: exerciseId,
          filename: body.filename,
          mime_type: body.mime_type ?? 'application/octet-stream',
          byte_size: base64Length(content),
          content_b64: content,
          created_at: now(),
        };
        state.resources.push(row);
        return created(resourceMeta(row));
      }
      return undefined;
    }
    const row = rows.find((candidate) => candidate.id === resourceId);
    if (method === 'DELETE') {
      state.resources = state.resources.filter((candidate) => candidate !== row);
      return noContent();
    }
    if (!row) return notFound('Resource not found');
    if (method === 'GET') {
      return {
        status: 200,
        bytes: base64ToBytes(row.content_b64),
        headers: { 'content-type': row.mime_type },
      };
    }
    if (method === 'PATCH') {
      if (rows.some((other) => other !== row && other.filename === body.filename)) {
        return conflict('A resource with this name already exists for this exercise.');
      }
      row.filename = body.filename;
      return ok(resourceMeta(row));
    }
    return undefined;
  }

  function exercises(method: string, parts: string[], query: URLSearchParams, body: any): Handled {
    const [, id, sub, ...rest] = parts;
    if (!id) {
      if (method === 'GET') return listExercises(query);
      if (method === 'POST') return createExercise(body);
      return undefined;
    }
    if (id === 'groups') {
      return method === 'PATCH' && sub && rest.length === 0 ? updateGroup(sub, body) : undefined;
    }
    if (!sub) {
      if (method === 'GET') {
        const exercise = state.hiddenExerciseIds.has(id) ? undefined : state.exercises.get(id);
        return exercise ? ok(exerciseResponse(exercise)) : notFound('Exercise not found');
      }
      if (method === 'PATCH') return updateExercise(id, body);
      if (method === 'DELETE') return deleteExercise(id);
      return undefined;
    }
    if (sub === 'new-version' && method === 'POST') return newVersion(id, body);
    if (sub === 'new-variant' && method === 'POST') return newVariant(id, body);
    if (sub === 'usage' && method === 'GET') return usage(id);
    if (sub === 'resources') {
      if (!state.exercises.has(id)) return method === 'DELETE' ? noContent() : notFound('Exercise not found');
      return resourceRoutes(method, id, rest, body);
    }
    return undefined;
  }

  /* ------------------------------------------------------------------------ */
  /* Exams                                                                     */
  /* ------------------------------------------------------------------------ */

  function examResponse(exam: any) {
    const links = (state.links.get(exam.id) ?? [])
      .map((link, idx) => ({ link, idx }))
      .filter(({ link }) => state.exercises.has(link.exercise_id))
      .sort(
        (a, b) =>
          (a.link.order_index ?? a.idx + 1) - (b.link.order_index ?? b.idx + 1) ||
          (a.link.sub_index ?? 0) - (b.link.sub_index ?? 0),
      );
    const exercises: Record<string, any>[] = links.map(({ link, idx }) => ({
      ...exerciseResponse(state.exercises.get(link.exercise_id)),
      order_index: link.order_index ?? idx + 1,
      mc_group_id: link.mc_group_id ?? null,
      sub_index: link.sub_index ?? null,
    }));
    const mcGroups = (state.mcGroups.get(exam.id) ?? []).map((group) =>
      withDefaults(
        {
          title: 'Grundlagen',
          scoring_text: '',
          order_index: 1,
          exam_id: exam.id,
          member_ids: exercises
            .filter((ex) => ex.mc_group_id === group.id)
            .sort((a, b) => (a.sub_index ?? 0) - (b.sub_index ?? 0))
            .map((ex) => ex.id),
        },
        group,
      ),
    );
    return {
      teacher_id: FAKE_TEACHER_ID,
      compilation_status: 'pending',
      latex_template: '',
      ...exam,
      exercises,
      mc_groups: mcGroups,
    };
  }

  /** Writes the exam's MC groups, minting ids for groups sent without one; returns the ids that exist afterwards. */
  function setMcGroups(examId: string, groups: any[]): Set<string> {
    const stored = groups.map((group) => ({ ...group, id: group.id ?? uuid() }));
    state.mcGroups.set(examId, stored);
    return new Set(stored.map((group) => group.id));
  }

  /** Collapses repeated exercise ids; the entry carrying MC group membership wins (`_dedupe_exercise_links`). */
  function dedupeLinks(links: Link[]): Link[] {
    const kept = new Map<string, Link>();
    for (const link of links) {
      const existing = kept.get(link.exercise_id);
      if (!existing || (existing.mc_group_id == null && link.mc_group_id != null)) kept.set(link.exercise_id, link);
    }
    return [...kept.values()];
  }

  /** Validates and normalises incoming links; an error response when one is unusable. */
  function resolveLinks(links: Link[], groupIds: Set<string>): Link[] | FakeResponse {
    const out: Link[] = [];
    for (const link of dedupeLinks(links)) {
      if (!state.exercises.has(link.exercise_id)) return notFound('Referenced exercise not found.');
      if (link.mc_group_id != null && !groupIds.has(link.mc_group_id)) {
        return fail(400, 'Unknown mc_group_id for this exam.', 'ERR_BAD_REQUEST');
      }
      out.push({
        exercise_id: link.exercise_id,
        order_index: link.order_index ?? out.length + 1,
        mc_group_id: link.mc_group_id ?? null,
        sub_index: link.sub_index ?? null,
      });
    }
    return out;
  }

  function createExam(body: any): FakeResponse {
    const id = body.id ?? uuid();
    if (state.exams.has(id)) return conflict('An exam with this id already exists.');
    const { exercise_links, exercise_ids, exercises: inline, mc_groups, ...fields } = body;

    const groupIds = setMcGroups(id, mc_groups ?? []);
    let links: Link[] = [];
    if (exercise_links?.length) {
      const resolved = resolveLinks(exercise_links, groupIds);
      if (!Array.isArray(resolved)) {
        state.mcGroups.delete(id);
        return resolved;
      }
      links = resolved;
    } else if (exercise_ids?.length) {
      const resolved = resolveLinks(
        exercise_ids.map((exerciseId: string, idx: number) => ({ exercise_id: exerciseId, order_index: idx + 1 })),
        groupIds,
      );
      if (!Array.isArray(resolved)) {
        state.mcGroups.delete(id);
        return resolved;
      }
      links = resolved;
    }

    // Inline exercises are created and linked after the library ones.
    for (const spec of inline ?? []) {
      if (spec.mc_group_id != null && !groupIds.has(spec.mc_group_id)) {
        state.mcGroups.delete(id);
        return fail(400, 'Unknown mc_group_id for this exam.', 'ERR_BAD_REQUEST');
      }
      const group = resolveGroup(undefined, spec);
      const withheld = spec.code_withheld ?? false;
      const exercise = addExercise(group, {
        ...spec,
        id: undefined,
        latex_body: withheld ? null : (spec.latex_body ?? ''),
        code_withheld: withheld,
        max_points: spec.latex_body ? parseExerciseScore(spec.latex_body) : (spec.max_points ?? 0),
      });
      links.push({
        exercise_id: exercise.id,
        order_index: links.length + 1,
        mc_group_id: spec.mc_group_id ?? null,
        sub_index: spec.sub_index ?? null,
      });
    }

    state.exams.set(id, { ...fields, id, created_at: now() });
    state.links.set(id, links);
    return created(examResponse(state.exams.get(id)));
  }

  function updateExam(id: string, body: any): FakeResponse {
    const exam = state.exams.get(id)!;
    const { exercise_links, exercise_ids, exercises: _inline, mc_groups, ...fields } = body ?? {};

    let groupIds = new Set((state.mcGroups.get(id) ?? []).map((group) => group.id));
    if (mc_groups != null) {
      // Links are detached before the groups are replaced, so members never vanish with a group.
      state.links.set(
        id,
        (state.links.get(id) ?? []).map((link) => ({ ...link, mc_group_id: null, sub_index: null })),
      );
      groupIds = setMcGroups(id, mc_groups);
    }
    const incoming: Link[] | undefined =
      exercise_links ?? exercise_ids?.map((exerciseId: string, idx: number) => ({ exercise_id: exerciseId, order_index: idx + 1 }));
    if (incoming != null) {
      const resolved = resolveLinks(incoming, groupIds);
      if (!Array.isArray(resolved)) return resolved;
      state.links.set(id, resolved);
    }

    for (const [key, value] of Object.entries(fields)) if (value != null && key !== 'id') exam[key] = value;
    return ok(examResponse(exam));
  }

  function deleteExam(id: string): FakeResponse {
    for (const sub of state.submissions.get(id) ?? []) state.scores.delete(sub.id);
    for (const map of [state.exams, state.links, state.mcGroups, state.students, state.submissions]) map.delete(id);
    return noContent();
  }

  /* ------------------------------------------------------------------------ */
  /* Results (all-server): students, submissions, scores                       */
  /* ------------------------------------------------------------------------ */

  const studentResponse = (student: any) => ({
    pseudonym_hmac: student.pseudonym_hmac,
    exam_id: student.exam_id,
    pii_ciphertext_b64: student.pii_ciphertext_b64,
    iv_b64: student.iv_b64,
    encryption_salt_b64: student.encryption_salt_b64,
  });

  function students(method: string, examId: string, rest: string[], body: any): Handled {
    const [hmac] = rest;
    const rows = state.students.get(examId) ?? [];
    if (!hmac) {
      if (method === 'GET') return ok(rows.map(studentResponse));
      if (method === 'POST') {
        // Upsert on (exam, pseudonym): the same pupil scanned twice must not duplicate.
        const record = {
          pseudonym_hmac: body.pseudonym_hmac,
          exam_id: examId,
          pii_ciphertext_b64: body.pii_ciphertext_b64,
          iv_b64: body.iv_b64,
          encryption_salt_b64: body.encryption_salt_b64,
        };
        const at = rows.findIndex((row) => row.pseudonym_hmac === record.pseudonym_hmac);
        if (at >= 0) rows[at] = record;
        else rows.push(record);
        state.students.set(examId, rows);
        return created(studentResponse(record));
      }
      return undefined;
    }
    if (method !== 'DELETE') return undefined;
    if (!rows.some((row) => row.pseudonym_hmac === hmac)) return notFound('Student identity not found.');
    state.students.set(examId, rows.filter((row) => row.pseudonym_hmac !== hmac));
    // Erasure cascades to the pupil's submissions and their scores.
    const doomed = (state.submissions.get(examId) ?? []).filter((sub) => sub.pseudonym_hmac === hmac);
    for (const sub of doomed) state.scores.delete(sub.id);
    state.submissions.set(
      examId,
      (state.submissions.get(examId) ?? []).filter((sub) => sub.pseudonym_hmac !== hmac),
    );
    return noContent();
  }

  const submissionResponse = (sub: any, withScan: boolean) => ({
    id: sub.id,
    exam_id: sub.exam_id,
    pseudonym_hmac: sub.pseudonym_hmac,
    total_score: sub.total_score ?? null,
    scan_ciphertext_b64: withScan ? (sub.scan_ciphertext_b64 ?? null) : null,
    scan_iv_b64: withScan ? (sub.scan_iv_b64 ?? null) : null,
    annotation_ciphertext_b64: sub.annotation_ciphertext_b64 ?? null,
    annotation_iv_b64: sub.annotation_iv_b64 ?? null,
    created_at: sub.created_at,
    has_scan: Boolean(sub.scan_ciphertext_b64),
    has_annotations: Boolean(sub.annotation_ciphertext_b64),
  });

  const scoreResponse = (row: any) => ({ ...row });

  function putScores(examId: string, submissionId: string, body: any): FakeResponse {
    const items: any[] = body?.scores ?? [];
    const linked = new Set((state.links.get(examId) ?? []).map((link) => link.exercise_id));
    if (items.some((item) => !linked.has(item.exercise_id))) {
      return notFound('One or more exercises are not part of this exam.');
    }
    const rows = state.scores.get(submissionId) ?? [];
    for (const item of items) {
      // Keyed on (submission, exercise), never on the client's id: a replay updates in place.
      const existing = rows.find((row) => row.exercise_id === item.exercise_id);
      const fields = {
        payload_ciphertext_b64: item.payload_ciphertext_b64 ?? null,
        payload_iv_b64: item.payload_iv_b64 ?? null,
        updated_at: now(),
      };
      if (existing) Object.assign(existing, fields);
      else rows.push({ id: item.id ?? uuid(), submission_id: submissionId, exercise_id: item.exercise_id, ...fields });
    }
    state.scores.set(submissionId, rows);
    return ok(rows.map(scoreResponse));
  }

  function scoreRoutes(method: string, examId: string, submissionId: string, rest: string[], body: any): Handled {
    const [exerciseId] = rest;
    if (!exerciseId) {
      if (method === 'GET') return ok((state.scores.get(submissionId) ?? []).map(scoreResponse));
      if (method === 'PUT') return putScores(examId, submissionId, body);
      if (method === 'DELETE') {
        state.scores.delete(submissionId);
        return noContent();
      }
      return undefined;
    }
    if (method !== 'DELETE') return undefined;
    state.scores.set(
      submissionId,
      (state.scores.get(submissionId) ?? []).filter((row) => row.exercise_id !== exerciseId),
    );
    return noContent();
  }

  function submissions(method: string, examId: string, rest: string[], query: URLSearchParams, body: any): Handled {
    const [subId, action, ...more] = rest;
    const rows = state.submissions.get(examId) ?? [];

    if (!subId) {
      if (method === 'GET') {
        const withScans = query.get('include_scans') === 'true';
        return ok(rows.map((sub) => submissionResponse(sub, withScans)));
      }
      if (method !== 'POST') return undefined;
      // A submission for an unknown pseudonym gets a placeholder identity, as the real endpoint does.
      const identities = state.students.get(examId) ?? [];
      if (!identities.some((row) => row.pseudonym_hmac === body.pseudonym_hmac)) {
        identities.push({
          pseudonym_hmac: body.pseudonym_hmac,
          exam_id: examId,
          pii_ciphertext_b64: 'AA==',
          iv_b64: 'AAAAAAAAAAAAAAAA',
          encryption_salt_b64: 'AAAAAAAAAAAAAAAAAAAAAA==',
        });
        state.students.set(examId, identities);
      }
      const existing = body.id ? rows.find((sub) => sub.id === body.id) : undefined;
      if (existing) {
        existing.pseudonym_hmac = body.pseudonym_hmac;
        if (body.total_score != null) existing.total_score = body.total_score;
        if (body.scan_ciphertext_b64) {
          existing.scan_ciphertext_b64 = body.scan_ciphertext_b64;
          existing.scan_iv_b64 = body.scan_iv_b64 ?? null;
        }
        // An absent annotation layer means "leave it"; deleting is explicit.
        if (body.annotation_ciphertext_b64) {
          existing.annotation_ciphertext_b64 = body.annotation_ciphertext_b64;
          existing.annotation_iv_b64 = body.annotation_iv_b64 ?? null;
        } else if (body.clear_annotations) {
          existing.annotation_ciphertext_b64 = null;
          existing.annotation_iv_b64 = null;
        }
        return created(submissionResponse(existing, true));
      }
      const sub = {
        id: body.id ?? uuid(),
        exam_id: examId,
        pseudonym_hmac: body.pseudonym_hmac,
        total_score: body.total_score ?? null,
        scan_ciphertext_b64: body.scan_ciphertext_b64 ?? null,
        scan_iv_b64: body.scan_iv_b64 ?? null,
        annotation_ciphertext_b64: body.annotation_ciphertext_b64 ?? null,
        annotation_iv_b64: body.annotation_iv_b64 ?? null,
        created_at: now(),
      };
      rows.push(sub);
      state.submissions.set(examId, rows);
      return created(submissionResponse(sub, true));
    }

    const sub = rows.find((row) => row.id === subId);
    if (!sub) return notFound('Submission not found.');

    if (!action) {
      if (method === 'GET') return ok(submissionResponse(sub, true));
      if (method === 'DELETE') {
        state.scores.delete(subId);
        state.submissions.set(examId, rows.filter((row) => row !== sub));
        return noContent();
      }
      return undefined;
    }
    if (action === 'score' && method === 'PATCH') {
      if (typeof body?.total_score === 'number' && body.total_score < 0) {
        return fail(422, 'total_score must be greater than or equal to 0', 'ERR_VALIDATION');
      }
      sub.total_score = body?.total_score ?? null;
      return ok(submissionResponse(sub, false));
    }
    if (action === 'grading' && method === 'DELETE') {
      sub.total_score = null;
      sub.annotation_ciphertext_b64 = null;
      sub.annotation_iv_b64 = null;
      state.scores.delete(subId);
      return noContent();
    }
    if (action === 'scores') return scoreRoutes(method, examId, subId, more, body);
    return undefined;
  }

  function exams(method: string, parts: string[], query: URLSearchParams, body: any): Handled {
    const [, id, sub, ...rest] = parts;
    if (!id) {
      if (method === 'GET') return ok([...state.exams.values()].map(examResponse));
      if (method === 'POST') return createExam(body);
      return undefined;
    }
    const exam = state.exams.get(id);
    if (!exam) return notFound('Exam not found');
    if (!sub) {
      if (method === 'GET') return ok(examResponse(exam));
      if (method === 'PATCH') return updateExam(id, body);
      if (method === 'DELETE') return deleteExam(id);
      return undefined;
    }
    if (sub === 'exercises' && method === 'GET') return ok(examResponse(exam).exercises);
    if (sub === 'logo' && rest.length === 0) {
      // The account has no logo, so an exam that follows it prints none (issue #46).
      if (method === 'GET') return ok({ ...NO_LOGO, mode: 'account' });
      if (method === 'PUT') {
        const custom = body?.mode === 'custom';
        return ok({ ...NO_LOGO, mode: body?.mode ?? 'account', ...(custom ? { source: 'exam', mime_type: 'image/png', byte_size: 1 } : {}) });
      }
    }
    if (sub === 'logo' && rest[0] === 'file' && method === 'GET') return notFound('No logo.');
    if (sub === 'students') return students(method, id, rest, body);
    if (sub === 'submissions') return submissions(method, id, rest, query, body);
    if (sub === 'scores' && method === 'GET' && rest.length === 0) {
      const live = new Set((state.submissions.get(id) ?? []).map((row) => row.id));
      return ok([...live].flatMap((subId) => (state.scores.get(subId) ?? []).map(scoreResponse)));
    }
    return undefined;
  }

  /* ------------------------------------------------------------------------ */
  /* Admin (account management)                                                */
  /* ------------------------------------------------------------------------ */

  function admin(method: string, parts: string[], query: URLSearchParams, body: any): Handled {
    const [, resource, id, action] = parts;
    if (state.role !== 'admin') return fail(403, 'Admin role required.', 'ERR_FORBIDDEN');
    if (resource === 'users') {
      if (method === 'GET' && !id) {
        const status = query.get('status') ?? 'all';
        const items = state.adminUsers.filter((u) =>
          status === 'pending' ? u.approved_at === null : status === 'active' ? u.approved_at !== null : true,
        );
        return ok({ items, total: items.length });
      }
      const user = state.adminUsers.find((u) => u.id === id);
      if (!user) return fail(404, 'User not found.', 'ERR_NOT_FOUND');
      if (method === 'POST' && action === 'approve') {
        Object.assign(user, { approved_at: new Date().toISOString(), registration_note: null, features: body.features });
        return ok(user);
      }
      if (method === 'POST' && action === 'reject') {
        state.adminUsers = state.adminUsers.filter((u) => u.id !== id);
        return noContent();
      }
      if (method === 'DELETE' && !action) {
        if (user.approved_at === null) return fail(409, 'This account is waiting for approval.', 'ERR_ACCOUNT_PENDING');
        state.adminUsers = state.adminUsers.filter((u) => u.id !== id);
        return noContent();
      }
      if (method === 'PATCH' && action === 'features') {
        user.features = { ...user.features, ...body };
        return ok(user);
      }
      if (method === 'POST' && action === 'reset-password') return ok({ message: 'sent', user_id: id, password_reset_sent: true });
    }
    if (resource === 'allowed-domains') {
      if (method === 'GET') return ok(state.adminDomains);
      if (method === 'POST') {
        const row = { id: crypto.randomUUID(), domain: String(body.domain).toLowerCase(), features: body.features, created_at: new Date().toISOString() };
        state.adminDomains.push(row);
        return ok(row);
      }
      const row = state.adminDomains.find((d) => d.id === id);
      if (!row) return fail(404, 'Domain not found.', 'ERR_NOT_FOUND');
      if (method === 'PATCH') {
        row.features = { ...row.features, ...body };
        return ok(row);
      }
      if (method === 'DELETE') {
        state.adminDomains = state.adminDomains.filter((d) => d.id !== id);
        return noContent();
      }
    }
    return undefined;
  }

  /* ------------------------------------------------------------------------ */
  /* Dispatch                                                                  */
  /* ------------------------------------------------------------------------ */

  function handle(method: string, rawPath: string, body?: unknown): FakeResponse {
    const verb = method.toUpperCase();
    state.requests.push(`${verb} ${rawPath}`);
    const url = new URL(rawPath, 'http://fake.invalid');
    const parts = url.pathname.split('/').filter(Boolean);
    const payload: any = body ?? {};

    let handled: Handled;
    switch (parts[0]) {
      case 'auth':
        handled = auth(verb, parts, payload);
        break;
      case 'keys':
        handled = keys(verb, parts, payload);
        break;
      case 'user':
        handled = user(verb, parts, payload);
        break;
      case 'mfa':
        handled = mfa(verb, parts);
        break;
      case 'webauthn':
        handled = webauthn(verb, parts);
        break;
      case 'training':
        handled = training(verb, parts);
        break;
      case 'exams':
        handled = exams(verb, parts, url.searchParams, payload);
        break;
      case 'exercises':
        handled = exercises(verb, parts, url.searchParams, payload);
        break;
      case 'admin':
        handled = admin(verb, parts, url.searchParams, payload);
        break;
    }
    if (handled) return handled;

    state.unhandled.push(`${verb} ${rawPath}`);
    return fail(404, `No fake route for ${verb} ${rawPath}`, 'ERR_NOT_FOUND');
  }

  return { state, handle, reset };
}
