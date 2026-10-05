import { writable } from 'svelte/store';

export interface HttpErrorState {
  isOpen: boolean;
  status: number;
  message?: string;
  code?: string;
}

const INITIAL_STATE: HttpErrorState = {
  isOpen: false,
  status: 0,
  message: '',
  code: '',
};

/** An HTTP error recorded instead of shown, while a `collectHttpErrors` scope is active. */
export interface CollectedHttpError {
  status: number;
  message: string;
  code: string;
}

/** Innermost active collection scope last; errors go to it instead of the modal. */
const collectors: CollectedHttpError[][] = [];

function createHttpErrorStore() {
  const { subscribe, set } = writable<HttpErrorState>(INITIAL_STATE);

  return {
    subscribe,

    /**
     * Display HTTP cat error modal for a given status code (100-599).
     */
    showError(status: number, message?: string, code?: string) {
      const statusCode = Number(status);
      if (isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
        return;
      }

      const collector = collectors[collectors.length - 1];
      if (collector) {
        collector.push({ status: statusCode, message: message || '', code: code || '' });
        return;
      }

      set({
        isOpen: true,
        status: statusCode,
        message: message || '',
        code: code || '',
      });
    },

    /**
     * Close the HTTP error modal.
     */
    closeError() {
      set(INITIAL_STATE);
    },
  };
}

export const httpErrorStore = createHttpErrorStore();

/**
 * Runs `fn` with the global HTTP error modal held back: every error a non-silent request would have
 * shown is collected and returned instead. For long batch operations (archive import/export) that
 * report their outcome in one place rather than as a pop-up per failed request.
 */
export async function collectHttpErrors<T>(fn: () => Promise<T>): Promise<{ result: T; errors: CollectedHttpError[] }> {
  const errors: CollectedHttpError[] = [];
  collectors.push(errors);
  try {
    return { result: await fn(), errors };
  } finally {
    collectors.splice(collectors.indexOf(errors), 1);
  }
}
