/**
 * Dexie version upgrade hooks: add a new version block here and never modify version(1) (Dexie detects upgrades by
 * version number), e.g. `db.version(2).stores({ exams: '…, newField' }).upgrade((tx) => …)`.
 */

// No migrations beyond version 1 yet.
// Import db to ensure migration hooks are registered.
import { db } from './db';
export { db };
