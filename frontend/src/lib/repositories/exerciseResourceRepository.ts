/**
 * Exercise resource files: local staging area plus server sync.
 *
 * The editor works against a *staging* owner id, never the live exercise, so a
 * file can be attached (and previewed) before the exercise exists anywhere —
 * on the server or in the local database. Pressing Save commits the staged set
 * onto the exercise; cancelling throws it away.
 *
 * Dexie is therefore always the working copy. In server/hybrid mode the staged
 * set is flushed to the API on save, and rows seeded from the server carry only
 * metadata until their bytes are actually needed.
 */

import { get } from 'svelte/store';
import { api } from '$lib/api/client';
import { uint8ArrayToBase64 } from '$lib/crypto/aesGcm';
import { db } from '$lib/db/db';
import { decryptResourceBytes, encryptResource } from '$lib/db/dbEncryption';
import type { ExerciseResourceRecord } from '$lib/db/schema';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import type { LatexResourceFile } from '$lib/latex/resources';

/** Resource requests never raise the global error toast: the panel reports them in place. */
const QUIET = { silentError: true };

function isLocalMode(): boolean {
  return get(storagePolicyStore).storageMode === 'all-local';
}

function mapApiToRecord(raw: any, ownerId: string): ExerciseResourceRecord {
  const remoteExerciseId = raw.exercise_id ?? raw.exerciseId;
  return {
    id: raw.id,
    exerciseId: ownerId,
    filename: raw.filename,
    mimeType: raw.mime_type ?? raw.mimeType ?? 'application/octet-stream',
    byteSize: raw.byte_size ?? raw.byteSize ?? 0,
    createdAt: raw.created_at ?? raw.createdAt,
    remoteId: raw.id,
    remoteExerciseId,
    pendingUpload: false
  };
}

async function listOnServer(exerciseId: string, ownerId = exerciseId): Promise<ExerciseResourceRecord[]> {
  const raw = await api.get<any[]>(`/exercises/${exerciseId}/resources`, QUIET);
  return raw.map((r) => mapApiToRecord(r, ownerId));
}

function sortByName(rows: ExerciseResourceRecord[]): ExerciseResourceRecord[] {
  return rows.sort((a, b) => a.filename.localeCompare(b.filename));
}

export const exerciseResourceRepository = {
  /** Everything currently attached to *ownerId* in the local database. */
  async listLocal(ownerId: string): Promise<ExerciseResourceRecord[]> {
    const rows = await db.exerciseResources.where('exerciseId').equals(ownerId).toArray();
    return sortByName(rows);
  },

  /**
   * Fill a staging area with what *exerciseId* currently has.
   *
   * In local mode the bytes are copied along; against a server only the
   * metadata is, so opening the editor does not download every figure.
   * Returns silently when the exercise is not known to the server yet.
   */
  async seedStaging(exerciseId: string, stagingId: string, key: CryptoKey | null): Promise<void> {
    await db.exerciseResources.where('exerciseId').equals(stagingId).delete();

    const local = await this.listLocal(exerciseId);
    for (const row of local) {
      const bytes = await this.getBytes(row, key).catch(() => null);
      const copy: ExerciseResourceRecord = {
        ...row,
        id: crypto.randomUUID(),
        exerciseId: stagingId,
        pendingUpload: bytes !== null && !row.remoteId
      };
      await db.exerciseResources.put(
        bytes ? await encryptResource(copy, bytes, key) : { ...copy, dataCt: undefined, dataIv: undefined, data: undefined }
      );
    }

    if (isLocalMode() || local.length > 0) return;

    try {
      for (const row of await listOnServer(exerciseId, stagingId)) {
        await db.exerciseResources.put({ ...row, id: crypto.randomUUID() });
      }
    } catch {
      // Unsaved exercise, offline, or a server that does not know it — the
      // staging area simply starts empty.
    }
  },

  /** Raw bytes: the local copy if there is one, otherwise a download. */
  async getBytes(resource: ExerciseResourceRecord, key: CryptoKey | null): Promise<Uint8Array> {
    if (resource.dataCt || resource.data) {
      return decryptResourceBytes(resource, key);
    }
    if (!resource.remoteId || !resource.remoteExerciseId) {
      throw new Error(`No stored bytes for "${resource.filename}".`);
    }
    const buf = await api.getBinary(
      `/exercises/${resource.remoteExerciseId}/resources/${resource.remoteId}`,
      QUIET
    );
    return new Uint8Array(buf);
  },

  /**
   * Add or replace a file in a staging area. Nothing is uploaded here — see
   * `commit`. Re-using a filename replaces that file, which is what a teacher
   * means when they drop in a corrected figure.
   */
  async stage(
    ownerId: string,
    filename: string,
    mimeType: string,
    bytes: Uint8Array,
    key: CryptoKey | null
  ): Promise<ExerciseResourceRecord> {
    const existing = (await this.listLocal(ownerId)).find((r) => r.filename === filename);

    const meta: ExerciseResourceRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      exerciseId: ownerId,
      filename,
      mimeType,
      byteSize: bytes.length,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      remoteId: existing?.remoteId,
      remoteExerciseId: existing?.remoteExerciseId,
      pendingUpload: true
    };

    const record = await encryptResource(meta, bytes, key);
    await db.exerciseResources.put(record);
    return record;
  },

  async rename(resource: ExerciseResourceRecord, filename: string): Promise<ExerciseResourceRecord> {
    const updated = { ...resource, filename };
    await db.exerciseResources.put(updated);
    return updated;
  },

  async remove(resource: ExerciseResourceRecord): Promise<void> {
    await db.exerciseResources.delete(resource.id);
  },

  async deleteForExercise(ownerId: string): Promise<void> {
    await db.exerciseResources.where('exerciseId').equals(ownerId).delete();
  },

  /**
   * Make the staged set the exercise's set.
   *
   * Local rows are re-keyed onto *exerciseId*; against a server the staged set
   * is authoritative, so new files are uploaded and files the teacher removed
   * while editing are deleted there too. Called only after the exercise itself
   * has been saved, so the id always exists by now.
   */
  async commit(
    stagingId: string,
    exerciseId: string,
    key: CryptoKey | null
  ): Promise<{ errors: string[] }> {
    const errors: string[] = [];
    const staged = await this.listLocal(stagingId);
    const serverBacked = !isLocalMode();

    if (serverBacked) {
      let remote: ExerciseResourceRecord[] = [];
      try {
        remote = await listOnServer(exerciseId);
      } catch (err: any) {
        errors.push(err?.message || 'Could not read the exercise files from the server.');
      }

      const stagedNames = new Set(staged.map((r) => r.filename));
      for (const row of remote) {
        if (!stagedNames.has(row.filename) && row.remoteId) {
          try {
            await api.delete(`/exercises/${exerciseId}/resources/${row.remoteId}`, QUIET);
          } catch {
            // Already gone, or gone by someone else's hand — nothing to undo.
          }
        }
      }

      for (const row of staged) {
        const unchanged =
          !row.pendingUpload &&
          row.remoteExerciseId === exerciseId &&
          remote.some((r) => r.filename === row.filename && r.byteSize === row.byteSize);
        if (unchanged) continue;

        try {
          const bytes = await this.getBytes(row, key);
          const created = await api.post<any>(
            `/exercises/${exerciseId}/resources`,
            {
              filename: row.filename,
              mime_type: row.mimeType,
              content_b64: uint8ArrayToBase64(bytes)
            },
            QUIET
          );
          row.remoteId = created.id;
          row.remoteExerciseId = exerciseId;
          row.pendingUpload = false;
        } catch (err: any) {
          errors.push(`${row.filename}: ${err?.message || 'upload failed'}`);
        }
      }
    }

    // Replace whatever the exercise had locally with the staged set.
    await db.exerciseResources.where('exerciseId').equals(exerciseId).delete();
    for (const row of staged) {
      await db.exerciseResources.put({ ...row, exerciseId });
    }
    await db.exerciseResources.where('exerciseId').equals(stagingId).delete();

    return { errors };
  },

  /**
   * Resource files for a compilation.
   *
   * `inline` are bytes the server cannot look up itself — staged files, and
   * everything in local mode. `exerciseIds` name saved exercises whose files
   * the server loads from its own database, which keeps the request small.
   * `needBytes` forces everything inline: the WASM engine runs in the browser
   * and has no database to read from.
   */
  async collectForCompile(
    owners: { id: string; label?: string; staged?: boolean }[],
    key: CryptoKey | null,
    needBytes: boolean
  ): Promise<{ inline: LatexResourceFile[]; exerciseIds: string[] }> {
    const inline: LatexResourceFile[] = [];
    const exerciseIds: string[] = [];

    for (const owner of owners) {
      const serverResolvable = !owner.staged && !isLocalMode();
      if (serverResolvable && !needBytes) {
        exerciseIds.push(owner.id);
        continue;
      }

      let rows = await this.listLocal(owner.id);
      if (rows.length === 0 && serverResolvable) {
        rows = await listOnServer(owner.id).catch(() => []);
      }
      for (const row of rows) {
        try {
          inline.push({
            filename: row.filename,
            content: await this.getBytes(row, key),
            owner: owner.label ?? owner.id
          });
        } catch {
          // Unreadable file (locked vault, deleted on the server): the compile
          // still runs and the missing-graphics check reports the gap.
        }
      }
    }

    return { inline, exerciseIds };
  }
};
