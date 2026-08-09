import { describe, it, expect, beforeEach } from 'vitest';
import { httpErrorStore } from '../src/lib/stores/httpErrorStore';
import { get } from 'svelte/store';

describe('httpErrorStore', () => {
  beforeEach(() => {
    httpErrorStore.closeError();
  });

  it('initializes with isOpen = false', () => {
    const state = get(httpErrorStore);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe(0);
    expect(state.message).toBe('');
  });

  it('shows error for valid HTTP status codes (100-599) including 401', () => {
    httpErrorStore.showError(401, 'Unauthorized access', 'ERR_UNAUTHORIZED');
    let state = get(httpErrorStore);
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe(401);
    expect(state.message).toBe('Unauthorized access');
    expect(state.code).toBe('ERR_UNAUTHORIZED');

    httpErrorStore.showError(404, 'Page not found', 'ERR_NOT_FOUND');
    state = get(httpErrorStore);
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe(404);
    expect(state.message).toBe('Page not found');
    expect(state.code).toBe('ERR_NOT_FOUND');

    httpErrorStore.showError(500, 'Server error');
    state = get(httpErrorStore);
    expect(state.isOpen).toBe(true);
    expect(state.status).toBe(500);
    expect(state.message).toBe('Server error');
  });

  it('ignores invalid HTTP status codes (<100 or >599 or NaN)', () => {
    httpErrorStore.showError(0, 'Network error');
    let state = get(httpErrorStore);
    expect(state.isOpen).toBe(false);

    httpErrorStore.showError(600, 'Invalid status');
    state = get(httpErrorStore);
    expect(state.isOpen).toBe(false);

    httpErrorStore.showError(NaN, 'NaN status');
    state = get(httpErrorStore);
    expect(state.isOpen).toBe(false);
  });

  it('closes error modal and resets state', () => {
    httpErrorStore.showError(403, 'Forbidden');
    expect(get(httpErrorStore).isOpen).toBe(true);

    httpErrorStore.closeError();
    const state = get(httpErrorStore);
    expect(state.isOpen).toBe(false);
    expect(state.status).toBe(0);
    expect(state.message).toBe('');
  });
});
