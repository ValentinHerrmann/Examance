/**
 * Storage-mode dispatch for exercise resource files.
 *
 * all-local  → encrypted rows in Dexie; the bytes never leave the browser
 *              except as part of a server *compile* request.
 * server/hybrid → plaintext blobs on the server, next to the exercise's LaTeX.
 */

import { get } from 'svelte/store';
import { api } from '$lib/api/client';
import { uint8ArrayToBase64 } from '$lib/crypto/aesGcm';
import { db } from '$lib/db/db';
import { decryptResourceBytes, encryptResource } from '$lib/db/dbEncryption';
import type { ExerciseResourceRecord } from '$lib/db/schema';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import type { LatexResourceFile } from '$lib/latex/resources';

function isLocal(): boolean {
  return get(storagePolicyStore).storageMode === 'all-local';
}

function mapApiToRecord(raw: any): ExerciseResourceRecord {
  return {
    id: raw.id,
    exerciseId: raw.exercise_id ?? raw.exerciseId,
    filename: raw.filename,
    mimeType: raw.mime_type ?? raw.mimeType ?? 'application/octet-stream',
    byteSize: raw.byte_size ?? raw.byteSize ?? 0,
    createdAt: raw.created_at ?? raw.createdAt,
  };
}

export const exerciseResourceRepository = {
  /** Metadata for one exercise's resources (no bytes). */
  async list(exerciseId: string): Promise<ExerciseResourceRecord[]> {
    if (isLocal()) {
      const rows = await db.exerciseResources.where('exerciseId').equals(exerciseId).toArray();
      return rows.sort((a, b) => a.filename.localeCompare(b.filename));
    }
    try {
      const raw = await api.get<any[]>(`/exercises/${exerciseId}/resources`);
      return raw.map(mapApiToRecord);
    } catch {
      const rows = await db.exerciseResources.where('exerciseId').equals(exerciseId).toArray();
      return rows.sort((a, b) => a.filename.localeCompare(b.filename));
    }
  },

  /** Raw bytes of one resource. */
  async getBytes(
    resource: ExerciseResourceRecord,
    key: CryptoKey | null
  ): Promise<Uint8Array> {
    if (resource.dataCt || resource.data) {
      return decryptResourceBytes(resource, key);
    }
    const buf = await api.getBinary(
      `/exercises/${resource.exerciseId}/resources/${resource.id}`
    );
    return new Uint8Array(buf);
  },

  /**
   * Store a file. Re-using an existing filename replaces that file, which is
   * what a teacher means when they re-upload a corrected figure.
   */
  async save(
    exerciseId: string,
    id: string,
    filename: string,
    mimeType: string,
    bytes: Uint8Array,
    key: CryptoKey | null
  ): Promise<ExerciseResourceRecord> {
    const existing = (
      await db.exerciseResources.where('exerciseId').equals(exerciseId).toArray()
    ).find((r) => r.filename === filename);

    const meta: ExerciseResourceRecord = {
      id: existing?.id ?? id,
      exerciseId,
      filename,
      mimeType,
      byteSize: bytes.length,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    if (isLocal()) {
      const record = await encryptResource(meta, bytes, key);
      await db.exerciseResources.put(record);
      return record;
    }

    const created = mapApiToRecord(
      await api.post<any>(`/exercises/${exerciseId}/resources`, {
        filename,
        mime_type: mimeType,
        content_b64: uint8ArrayToBase64(bytes),
      })
    );
    // Mirror locally so previews and offline compiles keep working.
    await db.exerciseResources.put(await encryptResource(created, bytes, key));
    return created;
  },

  async rename(
    resource: ExerciseResourceRecord,
    filename: string
  ): Promise<ExerciseResourceRecord> {
    const updated = { ...resource, filename };
    if (!isLocal()) {
      await api.patch(`/exercises/${resource.exerciseId}/resources/${resource.id}`, {
        filename,
      });
    }
    await db.exerciseResources.put(updated);
    return updated;
  },

  async delete(resource: ExerciseResourceRecord): Promise<void> {
    if (!isLocal()) {
      try {
        await api.delete(`/exercises/${resource.exerciseId}/resources/${resource.id}`);
      } catch {
        // Local copy is still removed; the server row is cleaned up on next sync.
      }
    }
    await db.exerciseResources.delete(resource.id);
  },

  async deleteForExercise(exerciseId: string): Promise<void> {
    await db.exerciseResources.where('exerciseId').equals(exerciseId).delete();
  },

  /** Copy every resource of one exercise onto another (new version / variant). */
  async copyTo(
    sourceExerciseId: string,
    targetExerciseId: string,
    key: CryptoKey | null
  ): Promise<void> {
    const rows = await db.exerciseResources.where('exerciseId').equals(sourceExerciseId).toArray();
    for (const row of rows) {
      const bytes = await this.getBytes(row, key);
      await this.save(
        targetExerciseId,
        crypto.randomUUID(),
        row.filename,
        row.mimeType,
        bytes,
        key
      );
    }
  },

  /**
   * Every resource of the given exercises, ready to hand to the compiler.
   *
   * The exercise's own name is carried along as `owner` so a filename clash
   * between two exercises can name both of them.
   */
  async collectForCompile(
    exercises: { id: string; label?: string }[],
    key: CryptoKey | null
  ): Promise<LatexResourceFile[]> {
    const files: LatexResourceFile[] = [];
    for (const ex of exercises) {
      const rows = await this.list(ex.id);
      for (const row of rows) {
        files.push({
          filename: row.filename,
          content: await this.getBytes(row, key),
          owner: ex.label ?? ex.id,
        });
      }
    }
    return files;
  },
};
