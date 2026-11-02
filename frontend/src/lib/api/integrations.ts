/** Delivery of results outside Examance (issue #209): Artemis through the server's allow-listed relay and result links by e-mail. Online-only and `silentError`: the share dialog reports per student. The Artemis token passes through and is never stored, here or on the server. */

import { api } from './client';

const quiet = { silentError: true } as const;

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

export async function fetchArtemisStudents(c: ArtemisCourse): Promise<ArtemisStudent[]> {
  return (await api.post<{ students: ArtemisStudent[] }>('/integrations/artemis/students', course(c), quiet)).students;
}

/** Posts *content* into the teacher's direct chat with the student. */
export async function sendArtemisMessage(c: ArtemisCourse, userId: number, content: string): Promise<void> {
  await api.post('/integrations/artemis/messages', { ...course(c), user_id: userId, content }, quiet);
}

/** Uploads a PDF into the direct chat with the student, with *message* above the attachment. */
export async function sendArtemisFile(c: ArtemisCourse, userId: number, filename: string, pdf: Uint8Array, message: string): Promise<void> {
  const form = new FormData();
  form.append('host', c.host);
  form.append('course_id', String(c.courseId));
  form.append('jwt', c.jwt);
  form.append('user_id', String(userId));
  form.append('message', message);
  form.append('file', new Blob([pdf as BlobPart], { type: 'application/pdf' }), filename);
  await api.postForm('/integrations/artemis/files', form, quiet);
}

export interface ResultMail {
  email: string;
  url: string;
  expiresAt: Date;
}

/** Sends each student their result link; returns the indexes of *recipients* the mail server refused. */
export async function sendResultMails(examTitle: string, locale: string, recipients: readonly ResultMail[]): Promise<number[]> {
  const res = await api.post<{ sent: number; failed: number[] }>(
    '/integrations/mail/results',
    {
      exam_title: examTitle,
      locale: locale === 'en' ? 'en' : 'de',
      recipients: recipients.map((r) => ({ email: r.email, url: r.url, expires_at: r.expiresAt.toISOString() })),
    },
    quiet
  );
  return res.failed;
}
