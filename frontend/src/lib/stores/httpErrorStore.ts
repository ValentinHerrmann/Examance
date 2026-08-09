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
