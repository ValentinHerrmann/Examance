/**
 * Dexie version upgrade hooks for future schema changes: add a new version block here and never modify
 * version(1) (Dexie detects upgrades by version number), e.g.
 *   db.version(2).stores({ exams: 'id, teacherId, retentionUntil, newField' })
 *     .upgrade((tx) => tx.table('exams').toCollection().modify((exam) => { exam.newField = 'defaultValue'; }));
 */

// No migrations beyond version 1 yet.
// Import db to ensure migration hooks are registered.
import { db } from './db';
export { db };
