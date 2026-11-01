/** One UI action's trash group (issue #125): every delete it sends shares the group, so the Trash page restores them together. */

/** How a repository delete treats the trash: `group` ties several deletes into one entry, `permanent` skips the trash (GDPR erasure, retention). */
export interface DeleteOptions {
  group?: string;
  permanent?: boolean;
}

export function newTrashGroup(): string {
  return crypto.randomUUID();
}

/** Request headers of a trashed delete; none for a permanent one or without a group (the server then makes one per request). */
export function trashHeaders(opts: DeleteOptions = {}): Record<string, string> | undefined {
  return opts.group && !opts.permanent ? { 'X-Trash-Group': opts.group } : undefined;
}

/** Appends `permanent=true` to a delete URL when the delete must skip the trash. */
export function deleteUrl(path: string, opts: DeleteOptions = {}): string {
  return opts.permanent ? `${path}${path.includes('?') ? '&' : '?'}permanent=true` : path;
}
