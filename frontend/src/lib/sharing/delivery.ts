/** The delivery step of each share channel (issue #209): what happens with a student's link, or with the PDF itself (Artemis PDF mode, Mebis), once it is ready. Slips need nothing here; e-mail collects the links and sends them in batches at the end; Mebis collects the PDFs into a ZIP to download. */

import { artemisErrorText, sendArtemisFile, sendArtemisMessage, sendResultMails, type ArtemisCourse, type ResultMail } from '#lib/api/integrations';
import { checkResultDeliveries, type ResultDeliveryInfo } from '#lib/api/resultShares';
import type { StudentRecord } from '#lib/db/schema';
import { mebisFeedbackPath } from '#lib/export/examExport';
import { exportDateStamp, slug, ZipBuilder } from '#lib/export/zip';
import { translate, translateIn } from '#lib/i18n';
import type { Locale } from '#lib/i18n/types';
import { formatDate } from '#lib/utils/format';
import { artemisIdOf, mebisIdOf } from '#lib/utils/studentQr';
import { sendsPdf, type ArtemisMode, type ShareChannelId } from './channels';
import { formatCode } from './shareCrypto';

export interface ArtemisTarget extends ArtemisCourse {
  mode: ArtemisMode;
}

export interface Delivery {
  /** True when the channel sends the graded PDF itself, so no link is made. */
  sendsPdf: boolean;
  /** *key* is the student's `joinKey`, under which the server records the outcome; *code* is set only when the teacher chose to send the key or code along with the link. */
  deliverLink(student: StudentRecord, key: string, name: string, url: string, code: string | null): Promise<void>;
  deliverPdf(student: StudentRecord, key: string, name: string, filename: string, pdf: Uint8Array): Promise<void>;
  /** Sends what was collected, reporting how many are sent of how many; returns a warning per student it could not reach. */
  finish(progress?: (done: number, total: number) => void): Promise<string[]>;
  /** A file for the teacher to save once finished (the Mebis ZIP), if the channel makes one. */
  download?(): DeliveryFile | null;
}

export interface DeliveryFile {
  bytes: Uint8Array;
  type: string;
  fileName: string;
}

/** The server sends a request's mails before answering, so batches stay small enough for the request timeout (it takes up to 100). */
const MAIL_BATCH = 20;

const artemisUser = (student: StudentRecord): number => {
  const id = artemisIdOf(student);
  if (!id) throw new Error(translate('sharing.channels.artemis.missing'));
  return Number(id);
};

/** Per-student warnings carry Artemis's status and step, not only the generic message. */
const withArtemisDetail = (sending: Promise<void>): Promise<void> =>
  sending.catch((err: unknown) => {
    throw new Error(artemisErrorText(err));
  });

export function createDelivery(
  channel: ShareChannelId,
  context: { examId: string; examTitle: string; expiresAt: Date; artemis?: ArtemisTarget; language: Locale }
): Delivery {
  const none = () => Promise.resolve();
  if (channel === 'email') {
    const queued: { mail: ResultMail; name: string }[] = [];
    return {
      sendsPdf: false,
      deliverLink(student, key, name, url, code) {
        if (!student.email) return Promise.reject(new Error(translate('sharing.channels.email.missing')));
        queued.push({ mail: { email: student.email, studentKey: key, url, expiresAt: context.expiresAt, ...(code ? { code: formatCode(code) } : {}) }, name });
        return Promise.resolve();
      },
      deliverPdf: none,
      async finish(progress) {
        const warnings: string[] = [];
        progress?.(0, queued.length);
        for (let i = 0; i < queued.length; i += MAIL_BATCH) {
          const batch = queued.slice(i, i + MAIL_BATCH);
          try {
            const failed = await sendResultMails(context.examId, context.examTitle, context.language, batch.map((q) => q.mail)); // NOSONAR: batches go one after another, so the mail server and the rate limit see a steady flow
            for (const index of failed) warnings.push(translate('sharing.channels.email.failed', { name: batch[index]?.name ?? '?' }));
          } catch (err) {
            const reason = err instanceof Error ? err.message : '';
            for (const q of batch) warnings.push(`${translate('sharing.channels.email.failed', { name: q.name })} ${reason}`.trim());
          }
          progress?.(Math.min(i + MAIL_BATCH, queued.length), queued.length);
        }
        return warnings;
      },
    };
  }
  if (channel === 'mebis') {
    const zip = new ZipBuilder();
    let count = 0;
    return {
      sendsPdf: true,
      deliverLink: none,
      deliverPdf(student, _key, name, _filename, pdf) {
        const id = mebisIdOf(student);
        if (!id) return Promise.reject(new Error(translate('sharing.channels.mebis.missing')));
        zip.add(mebisFeedbackPath(name, id), pdf);
        count++;
        return Promise.resolve();
      },
      finish: () => Promise.resolve([]),
      download: () => (count ? { bytes: zip.toBytes(), type: 'application/zip', fileName: `${slug(context.examTitle)}_mebis_feedback_${exportDateStamp()}.zip` } : null),
    };
  }
  if (channel === 'artemis') {
    const target = context.artemis;
    if (!target) throw new Error(translate('sharing.channels.artemis.setupMissing'));
    // Messages to students use the language the teacher chose for them, not the UI's.
    const say = (key: Parameters<typeof translate>[0], vars?: Parameters<typeof translate>[1]) => translateIn(context.language, key, vars);
    const intro = say('sharing.channels.artemis.message', { exam: context.examTitle, date: formatDate(context.expiresAt, context.language) });
    return {
      sendsPdf: sendsPdf(channel, target.mode),
      deliverLink: (student, key, _name, url, code) =>
        withArtemisDetail(
          sendArtemisMessage(
            target,
            artemisUser(student),
            `${intro}\n\n${url}\n\n${code ? say('sharing.channels.artemis.withKey', { key: formatCode(code) }) : say('sharing.channels.artemis.needsKey')}`,
            { examId: context.examId, studentKey: key }
          )
        ),
      deliverPdf: (student, key, _name, filename, pdf) =>
        withArtemisDetail(
          sendArtemisFile(target, artemisUser(student), filename, pdf, say('sharing.channels.artemis.pdfMessage', { exam: context.examTitle }), {
            examId: context.examId,
            studentKey: key,
          })
        ),
      finish: () => Promise.resolve([]),
    };
  }
  return { sendsPdf: false, deliverLink: none, deliverPdf: none, finish: () => Promise.resolve([]) };
}

/** Tells one student their objection was answered, with the result link, through the same mail path as the results (issue #226); false when the mail server refused it. */
export async function mailReviewReply(context: { examId: string; examTitle: string; expiresAt: Date; language: Locale }, student: StudentRecord, key: string, url: string): Promise<boolean> {
  if (!student.email) return false;
  const failed = await sendResultMails(context.examId, context.examTitle, context.language, [{ email: student.email, studentKey: key, url, expiresAt: context.expiresAt }], 'review_reply');
  return failed.length === 0;
}

/** How often the dialog has the server read the bounce mailbox while it waits after an e-mail run (issue #221). */
export const BOUNCE_POLL_MS = 5000;

/** The bounce window ends at the latest `watchUntil` the server set (30 s after sending); null when nothing is watched. */
export function bounceWindowEnd(deliveries: readonly ResultDeliveryInfo[]): number | null {
  const ends = deliveries.filter((d) => d.channel === 'email').map((d) => Date.parse(d.watchUntil));
  const end = Math.max(...ends);
  return ends.length && end > Date.now() ? end : null;
}

/** Reads the bounce mailbox every BOUNCE_POLL_MS until the window ends or *signal* aborts, reporting statuses and seconds left. A failed check is skipped: the next one, or the teacher's forwarded mail, catches up. */
export async function watchBounces(
  examId: string,
  initial: readonly ResultDeliveryInfo[],
  onUpdate: (deliveries: ResultDeliveryInfo[], secondsLeft: number) => void,
  signal: AbortSignal
): Promise<void> {
  let end = bounceWindowEnd(initial);
  while (end !== null && !signal.aborted) {
    const left = end - Date.now();
    if (left <= 0) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.min(BOUNCE_POLL_MS, left));
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
    if (signal.aborted) break;
    try {
      const deliveries = await checkResultDeliveries(examId); // NOSONAR: one check after another, never in parallel
      end = bounceWindowEnd(deliveries) ?? end;
      onUpdate(deliveries, Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    } catch {
      // Skipped on purpose (see above).
    }
  }
}
