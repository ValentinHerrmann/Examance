/** Maintenance mode (issue #130): the teacher's "I've saved my work", and the admin controls. */

import { api } from './client';
import type { DowntimeClass, MaintenanceStatus } from '#lib/stores/maintenanceStore';

export const DOWNTIME_CLASSES = ['very_short', 'short', 'long', 'unspecific'] as const satisfies readonly DowntimeClass[];

/** Counts are null when the server's presence store is unreachable: unknown, never zero. */
export interface PresenceCounts {
  online: number | null;
  warned: number | null;
  ready: number | null;
}

export interface AdminMaintenance {
  status: MaintenanceStatus;
  backup_wanted: boolean;
  backup_state: 'running' | 'done' | 'failed' | null;
  backup_file: string | null;
  backup_finished_at: string | null;
  offsite_state: 'skipped' | 'running' | 'done' | 'failed' | null;
  counts: PresenceCounts;
}

export function markReady(revision: number): Promise<void> {
  return api.post<void>('/maintenance/ready', { revision }, { silentError: true });
}

export function getMaintenance(): Promise<AdminMaintenance> {
  return api.get<AdminMaintenance>('/admin/maintenance', { silentError: true });
}

export function startMaintenance(body: {
  lead_minutes: number;
  downtime_class: DowntimeClass;
  backup: boolean;
}): Promise<AdminMaintenance> {
  return api.post<AdminMaintenance>('/admin/maintenance', body, { silentError: true });
}

export function endMaintenance(): Promise<AdminMaintenance> {
  return api.delete<AdminMaintenance>('/admin/maintenance', { silentError: true });
}
