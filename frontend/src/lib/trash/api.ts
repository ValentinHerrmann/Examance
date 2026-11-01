/** Server trash (`/trash`, issue #125). */
import { api } from '#lib/api/client';

export interface ServerTrashEntry {
  id: string;
  kind: string;
  label: Record<string, any>;
  deleted_at: string;
  purge_after: string;
}

export interface ServerTrashGroup {
  group_id: string;
  deleted_at: string;
  purge_after: string;
  entries: ServerTrashEntry[];
}

export interface ServerTrashList {
  grace_days: number;
  groups: ServerTrashGroup[];
}

export interface RestoreSkip {
  table: string;
  id: string | null;
  reason: string;
}

export interface RestoreResult {
  restored: Record<string, number>;
  skipped: RestoreSkip[];
}

export function listServerTrash(): Promise<ServerTrashList> {
  return api.get<ServerTrashList>('/trash', { silentError: true });
}

export function restoreServerGroup(groupId: string): Promise<RestoreResult> {
  return api.post<RestoreResult>(`/trash/${groupId}/restore`, undefined, { silentError: true });
}

export function purgeServerGroup(groupId: string): Promise<void> {
  return api.delete<void>(`/trash/${groupId}`, { silentError: true });
}
