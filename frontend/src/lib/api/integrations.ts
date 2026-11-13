/** Delivery of results outside Examance (issue #209): Artemis through the server's allow-listed relay and result links by e-mail. Online-only and `silentError`: the share dialog reports per student. The Artemis token passes through and is never stored, here or on the server. */

import { api, ApiError } from './client';

const quiet = { silentError: true } as const;

/** The localized message, plus the server's diagnostic detail (HTTP status, step, Artemis error key) when Artemis itself failed, so an endpoint move shows in the dialog without server logs. */
export function artemisErrorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const detail = err instanceof ApiError && err.code === 'ERR_ARTEMIS_UPSTREAM' ? err.body?.detail : undefined;
  return typeof detail === 'string' && detail !== err.message ? `${err.message} (${detail})` : err.message;
}

export interface ArtemisCourse {
  /** Host name of the Artemis instance, e.g. `artemis.tum.de`; the server allows only its configured hosts. */
  host: string;
  courseId: number;
  /** The teacher's Artemis session token (the `jwt` cookie). */
  jwt: string;
}

export interface ArtemisStudent {
  id: number;
  name: string;
  login: string | null;
  email: string | null;
}

const course = (c: ArtemisCourse) => ({ host: c.host, course_id: c.courseId, jwt: c.jwt });

/** Which exam and student a send is for, so the server keeps its outcome as the student's delivery status (issue #221). */
export interface DeliveryTarget {
  examId: string;
  /** `joinKey` of the student. */
  studentKey: string;
}

export async function fetchArtemisStudents(c: ArtemisCourse): Promise<ArtemisStudent[]> {
  return (await api.post<{ students: ArtemisStudent[] }>('/integrations/artemis/students', course(c), quiet)).students;
}

/** Posts *content* into the teacher's direct chat with the student. */
export async function sendArtemisMessage(c: ArtemisCourse, userId: number, content: string, target: DeliveryTarget): Promise<void> {
  await api.post('/integrations/artemis/messages', { ...course(c), user_id: userId, content, exam_id: target.examId, student_key: target.studentKey }, quiet);
}

/** Uploads a PDF into the direct chat with the student, with *message* above the attachment. */
export async function sendArtemisFile(c: ArtemisCourse, userId: number, filename: string, pdf: Uint8Array, message: string, target: DeliveryTarget): Promise<void> {
  const form = new FormData();
  form.append('host', c.host);
  form.append('course_id', String(c.courseId));
  form.append('jwt', c.jwt);
  form.append('user_id', String(userId));
  form.append('message', message);
  form.append('exam_id', target.examId);
  form.append('student_key', target.studentKey);
  form.append('file', new Blob([pdf as BlobPart], { type: 'application/pdf' }), filename);
  await api.postForm('/integrations/artemis/files', form, quiet);
}

export interface ResultMail {
  email: string;
  /** `joinKey` of the student; the server records the outcome under it. */
  studentKey: string;
  url: string;
  expiresAt: Date;
  /** The key or code, only when the teacher chose to send it along. */
  code?: string;
}

/** Sends each student their result link; returns the indexes of *recipients* the mail server refused. */
/** *kind* `review_reply` mails "your teacher answered your objection" instead of the result text (issue #226). */
export async function sendResultMails(examId: string, examTitle: string, locale: string, recipients: readonly ResultMail[], kind: 'result' | 'review_reply' = 'result'): Promise<number[]> {
  const res = await api.post<{ sent: number; failed: number[] }>(
    '/integrations/mail/results',
    {
      exam_id: examId,
      exam_title: examTitle,
      locale: locale === 'en' ? 'en' : 'de',
      ...(kind === 'result' ? {} : { kind }),
      recipients: recipients.map((r) => ({ email: r.email, student_key: r.studentKey, url: r.url, expires_at: r.expiresAt.toISOString(), ...(r.code ? { code: r.code } : {}) })),
    },
    quiet
  );
  return res.failed;
}
