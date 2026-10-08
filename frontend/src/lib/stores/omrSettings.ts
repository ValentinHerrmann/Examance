import { writable } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';
import {
  DEFAULT_OMR_PARAMS,
  OMR_ALGORITHM_VERSION,
  defaultOmrProfile,
  normalizeOmrParams,
  validateOmrParams,
  type OmrDetectionParams,
  type OmrParamsError,
  type OmrSettingsProfile,
} from '#lib/grading/omrSettings';

/**
 * MC-detection settings for the *next* run. Per browser, not per account, not synced (like `bg_storage_policy` / `bg_locale`);
 * survives lock, wipe and mode switches. Callers take one `get()` snapshot per run so a mid-run change can't mix parameters.
 */
const STORAGE_KEY = 'bg_omr_settings';

function parseProfile(raw: string | null): OmrSettingsProfile {
  if (!raw) return defaultOmrProfile();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== 1) return defaultOmrProfile();
    return {
      schemaVersion: 1,
      source: parsed.source === 'user' || parsed.source === 'learned' ? parsed.source : 'default',
      revision: Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
      algorithmVersion: OMR_ALGORITHM_VERSION,
      // The raster scale is not a user setting — never take it from storage.
      params: { ...normalizeOmrParams(parsed.params), scanScale: DEFAULT_OMR_PARAMS.scanScale },
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return defaultOmrProfile();
  }
}

function createOmrSettingsStore() {
  const { subscribe, set, update } = writable<OmrSettingsProfile>(
    parseProfile(safeLocalStorage.getItem(STORAGE_KEY))
  );

  // Another tab saved new settings: pick them up so a run started here uses them.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) set(parseProfile(e.newValue));
    });
  }

  return {
    subscribe,
    /** Validates and persists. Returns the validation errors (nothing is saved unless empty). */
    save(params: OmrDetectionParams): OmrParamsError[] {
      const candidate = { ...params, scanScale: DEFAULT_OMR_PARAMS.scanScale };
      const errors = validateOmrParams(candidate);
      if (errors.length > 0) return errors;
      update((current) => {
        const next: OmrSettingsProfile = {
          schemaVersion: 1,
          source: 'user',
          revision: current.revision + 1,
          algorithmVersion: OMR_ALGORITHM_VERSION,
          params: candidate,
          updatedAt: new Date().toISOString(),
        };
        safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      return [];
    },
    /** Back to the built-in defaults. The revision keeps counting so run snapshots stay distinguishable. */
    reset() {
      update((current) => {
        const next: OmrSettingsProfile = {
          ...defaultOmrProfile(),
          revision: current.revision + 1,
          updatedAt: new Date().toISOString(),
        };
        safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
  };
}

export const omrSettingsStore = createOmrSettingsStore();
