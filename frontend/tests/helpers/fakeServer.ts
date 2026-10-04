/**
 * A tiny in-memory backend for tests that need exams and exercises, which always live on the
 * server since local mode was discontinued (issue #47). Only the routes the archive packer and
 * importer use are served; anything else answers 404. Install it in a test file with:
 *
 *   vi.mock('../src/lib/api/client', async () => (await import('./helpers/fakeServer')).clientModule);
 *
 * Responses are snake_case, like the real API, so the repositories' mappers run unchanged.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Link {
  exercise_id: string;
  order_index?: number;
  mc_group_id?: string;
  sub_index?: number;
}

interface State {
  exams: Map<string, any>;
  exercises: Map<string, any>;
  links: Map<string, Link[]>;
  mcGroups: Map<string, any[]>;
  resources: any[];
  /** Exercises that exist but belong to another account and are private: `GET /exercises/:id` answers 404. */
  hiddenExerciseIds: Set<string>;
  /** Every request, as "METHOD /path", so tests can assert what was (not) called. */
  requests: string[];
}

const state: State = {
  exams: new Map(),
  exercises: new Map(),
  links: new Map(),
  mcGroups: new Map(),
  resources: [],
  hiddenExerciseIds: new Set(),
  requests: [],
};

export const fakeServer = {
  state,
  reset(): void {
    state.exams.clear();
    state.exercises.clear();
    state.links.clear();
    state.mcGroups.clear();
    state.resources = [];
    state.hiddenExerciseIds.clear();
    state.requests = [];
  },
};

const notFound = (path: string) => new ApiError(404, 'ERR_NOT_FOUND', `No fake route for ${path}`);
const conflict = (id: string) => new ApiError(409, 'ERR_CONFLICT', `Id ${id} already exists`);

function examResponse(exam: any) {
  const exercises = (state.links.get(exam.id) ?? []).map((link, idx) => ({
    ...state.exercises.get(link.exercise_id),
    order_index: link.order_index ?? idx + 1,
    mc_group_id: link.mc_group_id,
    sub_index: link.sub_index,
  }));
  return { ...exam, exercises, mc_groups: state.mcGroups.get(exam.id) ?? [] };
}

function createExam(body: any) {
  const id = body.id ?? crypto.randomUUID();
  if (state.exams.has(id)) throw conflict(id);
  const { exercise_links, mc_groups, ...exam } = body;
  state.exams.set(id, { ...exam, id });
  state.links.set(id, exercise_links ?? []);
  state.mcGroups.set(id, mc_groups ?? []);
  return examResponse(state.exams.get(id));
}

function createExercise(body: any) {
  const id = body.id ?? crypto.randomUUID();
  if (state.exercises.has(id)) throw conflict(id);
  const exercise = {
    ...body,
    id,
    latex_body: body.code_withheld ? null : body.latex_body,
    code_withheld: body.code_withheld ?? false,
    exercise_group_id: body.exercise_group_id ?? crypto.randomUUID(),
  };
  state.exercises.set(id, exercise);
  return exercise;
}

async function request(method: string, path: string, body?: any): Promise<any> {
  state.requests.push(`${method} ${path.split('?')[0]}`);
  const parts = path.split('?')[0].split('/').filter(Boolean);

  if (parts[0] === 'exams') {
    const [, id, sub] = parts;
    if (method === 'GET' && !id) return [...state.exams.values()].map(examResponse);
    if (method === 'POST' && !id) return createExam(body);
    const exam = id ? state.exams.get(id) : undefined;
    if (!exam) throw notFound(path);
    if (method === 'GET' && !sub) return examResponse(exam);
    if (method === 'GET' && sub === 'exercises') return examResponse(exam).exercises;
    if (method === 'PATCH' && !sub) {
      const { exercise_links, mc_groups, ...fields } = body ?? {};
      state.exams.set(id, { ...exam, ...fields, id });
      if (exercise_links) state.links.set(id, exercise_links);
      if (mc_groups) state.mcGroups.set(id, mc_groups);
      return examResponse(state.exams.get(id));
    }
  }

  if (parts[0] === 'exercises') {
    const [, id, sub] = parts;
    if (method === 'GET' && !id) return [...state.exercises.values()];
    if (method === 'POST' && !id) return createExercise(body);
    const exercise = id ? state.exercises.get(id) : undefined;
    if (!exercise) throw notFound(path);
    if (method === 'GET' && !sub) {
      if (state.hiddenExerciseIds.has(id)) throw notFound(path);
      return exercise;
    }
    if (method === 'PATCH' && !sub) {
      state.exercises.set(id, { ...exercise, ...body, id });
      return state.exercises.get(id);
    }
    if (method === 'POST' && sub === 'resources') {
      state.resources.push({ exercise_id: id, ...body });
      return { id: crypto.randomUUID() };
    }
  }

  throw notFound(path);
}

/** Drop-in replacement for `src/lib/api/client`'s exports. */
export const clientModule = {
  ApiError,
  api: {
    get: (path: string) => request('GET', path),
    post: (path: string, body?: unknown) => request('POST', path, body),
    put: (path: string, body?: unknown) => request('PUT', path, body),
    patch: (path: string, body?: unknown) => request('PATCH', path, body),
    delete: (path: string) => request('DELETE', path),
  },
};
