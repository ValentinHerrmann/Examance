import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import { encryptExercise, loadExercisesEncrypted } from '#lib/db/dbEncryption';
import type { ExerciseRecord } from '#lib/db/schema';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { isServerBacked } from '#lib/utils/serverBacked';


/** The library's own exercises: from the server, mirrored sealed into IndexedDB; the local copy only when the server cannot answer (`localFallback`, the page then hides sharing). Exercises whose code was withheld (results-only imports) belong to their exam, not the library. */
export async function loadLibraryExercises(key: CryptoKey | null): Promise<{ exercises: ExerciseRecord[]; localFallback: boolean }> {
  const local = async () => (await loadExercisesEncrypted(key)).filter((ex) => !ex.codeWithheld);
  if (!isServerBacked()) return { exercises: await local(), localFallback: false };
  try {
    const remote = (await api.get('/exercises', { silentError: true })) as any[];
    const exercises = remote.map(mapApiToExerciseRecord).filter((ex) => !ex.codeWithheld);
    await db.exercises.bulkPut(await Promise.all(exercises.map((ex) => encryptExercise(ex, key))));
    return { exercises, localFallback: false };
  } catch (apiErr) {
    console.warn('Failed to fetch remote exercises, falling back to IDB:', apiErr);
    return { exercises: await local(), localFallback: true };
  }
}
