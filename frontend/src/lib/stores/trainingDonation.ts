import { writable } from 'svelte/store';
import { safeLocalStorage } from '$lib/utils/storage';

/**
 * Opt-in consent to donate anonymous checkbox crops of verified MC questions (training data for a shared
 * detector). Off by default; per browser. Bump `CONSENT_VERSION` whenever what is donated changes, so earlier consent no longer counts.
 */
export const DONATION_CONSENT_VERSION = 2;
const STORAGE_KEY = 'bg_omr_donation';

export interface TrainingDonationConsent {
  enabled: boolean;
  consentedAt?: string;
  consentVersion?: number;
}

function parse(raw: string | null): TrainingDonationConsent {
  if (!raw) return { enabled: false };
  try {
    const v = JSON.parse(raw);
    const valid = v?.enabled === true && v?.consentVersion === DONATION_CONSENT_VERSION;
    return valid
      ? { enabled: true, consentedAt: String(v.consentedAt ?? ''), consentVersion: DONATION_CONSENT_VERSION }
      : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

function createTrainingDonationStore() {
  const { subscribe, set } = writable<TrainingDonationConsent>(parse(safeLocalStorage.getItem(STORAGE_KEY)));

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) set(parse(e.newValue));
    });
  }

  return {
    subscribe,
    setEnabled(enabled: boolean) {
      const next: TrainingDonationConsent = enabled
        ? { enabled: true, consentedAt: new Date().toISOString(), consentVersion: DONATION_CONSENT_VERSION }
        : { enabled: false };
      safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      set(next);
    },
  };
}

export const trainingDonationStore = createTrainingDonationStore();
