/** The objection thread of the submission on the grade page (issue #226). Like `gradingStore`, plain state that leaf components (ReviewThread, ReviewReplyBar) subscribe to; loading, opening and sending stay in `sharing/reviewService.ts`. Pseudonymous: it holds no student name. */

import { writable } from 'svelte/store';

export interface ReviewThread {
  shareId: string;
  studentKey: string;
  /** Objection text per item key; empty when the objection could not be decrypted. */
  objections: Record<string, string>;
  /** The reply as sent so far, per item key. */
  replies: Record<string, string>;
  unreadable: boolean;
  submittedAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
}

export interface ReviewState {
  /** Submission the thread belongs to; null when there is none. */
  submissionId: string | null;
  thread: ReviewThread | null;
  /** The student has an address the reply can be mailed to (the address itself never reaches this store). */
  canMail: boolean;
  /** Reply text per item key, edited by the teacher. */
  drafts: Record<string, string>;
  notify: boolean;
  sending: boolean;
  /** Last message of a failed load or send. */
  error: string;
  /** Set after a reply went out, for the confirmation line. */
  sentAt: string | null;
  mailFailed: boolean;
}

const INITIAL: ReviewState = { submissionId: null, thread: null, canMail: false, drafts: {}, notify: true, sending: false, error: '', sentAt: null, mailFailed: false };

const store = writable<ReviewState>({ ...INITIAL });

export const reviewStore = {
  subscribe: store.subscribe,
  set: (next: ReviewState) => store.set(next),
  patch: (partial: Partial<ReviewState>) => store.update((s) => ({ ...s, ...partial })),
  setDraft: (key: string, text: string) => store.update((s) => ({ ...s, drafts: { ...s.drafts, [key]: text } })),
  reset: () => store.set({ ...INITIAL }),
};
