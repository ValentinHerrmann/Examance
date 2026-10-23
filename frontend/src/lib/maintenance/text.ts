import { derived } from 'svelte/store';
import { locale, t } from '#lib/i18n';
import { intlLocale } from '#lib/utils/format';
import type { MaintenanceStatus } from '#lib/stores/maintenanceStore';

/** Shared wording for the maintenance notices, the sign-in page and the admin tab (issue #130). */
export const maintenanceText = derived([t, locale], ([$t, $locale]) => {
  const kind = (s: MaintenanceStatus | null) =>
    s?.kind === 'deployment' ? $t('maintenance.kind.deployment') : $t('maintenance.kind.manual');
  const durationOf = (c: MaintenanceStatus['downtime_class']) => {
    switch (c) {
      case 'very_short': return $t('maintenance.duration.very_short');
      case 'short': return $t('maintenance.duration.short');
      case 'long': return $t('maintenance.duration.long');
      default: return $t('maintenance.duration.unspecific');
    }
  };
  return {
    kind,
    durationOf,
    duration: (s: MaintenanceStatus | null) => durationOf(s?.downtime_class ?? null),
    time: (iso: string | null) =>
      iso ? new Date(iso).toLocaleTimeString(intlLocale($locale), { hour: '2-digit', minute: '2-digit' }) : '',
    /** "4:59", or "any moment now" once the announced start passed. */
    countdown: (seconds: number | null) => {
      if (seconds === null || seconds <= 0) return $t('maintenance.soon');
      const m = Math.floor(seconds / 60);
      return `${m}:${String(seconds % 60).padStart(2, '0')}`;
    },
    /** How long before the start the second reminder comes ("One minute", "10 seconds"). */
    reminder: (s: MaintenanceStatus | null) => {
      if (!s?.starts_at || !s.second_warning_at) return $t('maintenance.reminderOneMinute');
      const secs = Math.round((Date.parse(s.starts_at) - Date.parse(s.second_warning_at)) / 1000);
      if (secs === 60) return $t('maintenance.reminderOneMinute');
      if (secs > 60 && secs % 60 === 0) return $t('maintenance.reminderMinutes', { n: secs / 60 });
      return $t('maintenance.reminderSeconds', { n: secs });
    },
  };
});
