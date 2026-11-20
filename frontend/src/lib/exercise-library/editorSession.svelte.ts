import { get } from 'svelte/store';
import type { ExerciseRecord } from '#lib/db/schema';
import { askToShare } from '#lib/exercise-library/askToShare';
import {
  EDITOR_AUTOSAVE_MS,
  cascadeGroupMetadata,
  exerciseDraftError,
  reportAfterSave,
  resourceSyncError,
  writeExercise,
  writeNewVersion,
  type ExerciseDraft,
} from '#lib/exercise-library/exerciseEditorSave';
import { translate } from '#lib/i18n';
import { exerciseResourceRepository } from '#lib/repositories/exerciseResourceRepository';
import { httpErrorStore } from '#lib/stores/httpErrorStore';
import { sessionStore } from '#lib/stores/session';
import { createAutosave } from '#lib/utils/autosave';

/** What the session reads from the editor form. */
export interface EditorSessionDeps {
  isOpen: () => boolean;
  /** The stored exercise being edited (autosave writes onto it), null for a new one or a new version. */
  editing: () => ExerciseRecord | null;
  /** The form in its stored form: a save runs only when it differs from the last saved one. */
  editKey: () => string;
  draft: () => ExerciseDraft;
  onSave?: (detail: { exercise: ExerciseRecord; isNewVersion: boolean }) => void;
  rememberSuggestions: () => void;
}

const groupMeta = (ex: Pick<ExerciseRecord, 'name' | 'topicTag' | 'grade' | 'subject'> | null): string =>
  JSON.stringify([ex?.name ?? '', ex?.topicTag ?? '', ex?.grade ?? '', ex?.subject ?? '']);

/** One opening of the exercise editor: its staged resource files, the autosave of an existing exercise (issue #232) and the session end (group metadata copied once, the parent refreshed once, the share question). Files that did not upload never count as saved (issue #298). */
export class EditorSession {
  /** Throwaway owner of the staged files: upload and preview work before the exercise exists. */
  stagingId = $state('');
  /** The staging area is filled asynchronously; the file panel loads and a commit runs only after it. */
  seeded = $state(false);
  /** The edit key of the last stored state. */
  savedKey = $state('');
  /** Whether the staged files were moved or copied onto the exercise; what is left goes when the dialog closes. */
  resourcesCommitted = false;
  readonly autosave;

  private seed: Promise<void> = Promise.resolve();
  private savedRecord: ExerciseRecord | null = null;
  private filesSaved = false;
  private committedFiles: Promise<string> = Promise.resolve('');
  private cascadedMeta = '';
  private finishedFlag = false;

  constructor(private readonly deps: EditorSessionDeps) {
    this.autosave = createAutosave({
      run: () => this.run(),
      delayMs: EDITOR_AUTOSAVE_MS,
      message: (err) => (err instanceof Error ? err.message : String(err)),
    });
  }

  /** A closed session, or one whose edit was discarded, never writes again. */
  get finished(): boolean {
    return this.finishedFlag;
  }

  /** Starts a session for `source` (the edited exercise or the version base): seeds a fresh staging area from its files, so a new version starts with them without ever writing back to the base. */
  start(source: ExerciseRecord | null, editKey: string): void {
    this.savedRecord = null;
    this.filesSaved = false;
    this.finishedFlag = false;
    this.savedKey = editKey;
    this.cascadedMeta = groupMeta(source);
    const stagingId = crypto.randomUUID();
    this.stagingId = stagingId;
    this.resourcesCommitted = false;
    this.seeded = false;
    this.seed = source?.id
      ? exerciseResourceRepository.seedStaging(source.id, stagingId, get(sessionStore).sessionKey).catch(() => {})
      : Promise.resolve();
    void this.seed.then(() => {
      if (this.stagingId === stagingId) this.seeded = true;
    });
    this.committedFiles = this.seed.then(() => exerciseResourceRepository.stagedSignature(stagingId));
  }

  /** Moves (or with `keepStaging` copies) the staged files onto the written exercise; files that did not upload throw `ResourceSyncError` and stay in this browser, flagged for upload. */
  async commit(exerciseId: string, key: CryptoKey | null, keepStaging = false): Promise<void> {
    await this.seed;
    const result = await exerciseResourceRepository.commit(this.stagingId, exerciseId, key, { keepStaging });
    this.resourcesCommitted = true;
    const failed = resourceSyncError(result);
    if (failed) throw failed;
  }

  /** An explicit save already stored the exercise, so the dialog closes; a file failure goes to the error dialog, never counts as a failed save. */
  commitAfterSave(exerciseId: string, key: CryptoKey | null): Promise<void> {
    return reportAfterSave(() => this.commit(exerciseId, key), (status, message) => httpErrorStore.showError(status, message));
  }

  /** The explicit save (a new exercise, or a new version of `versionBase`): writes it, copies group metadata to the sisters, then moves the staged set onto it, which for a new version is the base version's files plus anything added here. */
  async save(draft: ExerciseDraft, versionBase: ExerciseRecord | null, key: CryptoKey | null): Promise<{ exercise: ExerciseRecord; isNewVersion: boolean }> {
    if (versionBase) {
      const exercise = await writeNewVersion(versionBase, draft, key);
      await this.commitAfterSave(exercise.id, key);
      return { exercise, isNewVersion: true };
    }
    const exercise = await writeExercise(this.deps.editing(), draft, { key });
    await cascadeGroupMetadata(exercise, key);
    await this.commitAfterSave(exercise.id, key);
    return { exercise, isNewVersion: false };
  }

  private async run(): Promise<void> {
    const base = this.deps.editing();
    const key = this.deps.editKey();
    if (!base || !this.deps.isOpen() || this.finishedFlag || key === this.savedKey) return;
    const draft = this.deps.draft();
    const invalid = exerciseDraftError(draft);
    if (invalid) throw new Error(translate(invalid));
    const sessionKey = get(sessionStore).sessionKey;
    this.savedRecord = await writeExercise(base, draft, { key: sessionKey });
    const stagingId = this.stagingId;
    if ((await exerciseResourceRepository.stagedSignature(stagingId)) !== (await this.committedFiles)) {
      await this.commit(base.id, sessionKey, true);
      this.committedFiles = exerciseResourceRepository.stagedSignature(stagingId);
      this.filesSaved = true;
    }
    this.savedKey = key;
  }

  /** Sister exercises share name, topic, grade and subject: copied once per session, not on every save. */
  async runPendingCascade(): Promise<void> {
    const record = this.savedRecord;
    if (!record || groupMeta(record) === this.cascadedMeta) return;
    this.cascadedMeta = groupMeta(record);
    await cascadeGroupMetadata(record, get(sessionStore).sessionKey);
  }

  /** Once per autosaving session, whichever way it ends: the group copy, then one refresh of the parent and the share question. */
  async finish(): Promise<void> {
    if (this.finishedFlag) return;
    this.finishedFlag = true;
    const record = this.savedRecord;
    await this.runPendingCascade();
    if (record) this.deps.rememberSuggestions();
    if (record || this.filesSaved) this.deps.onSave?.({ exercise: record ?? this.deps.editing()!, isNewVersion: false });
    if (record) void askToShare(record.id);
  }
}
