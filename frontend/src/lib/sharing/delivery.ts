/** The delivery step of each share channel (issue #209): what happens with a student's link, or with the PDF itself in Artemis PDF mode, once it is ready. Slips need nothing here; e-mail collects the links and sends them in batches at the end. */

import { get } from 'svelte/store';
import { sendArtemisFile, sendArtemisMessage, sendResultMails, type ArtemisCourse, type ResultMail } from '#lib/api/integrations';
import type { StudentRecord } from '#lib/db/schema';
import { locale, translate } from '#lib/i18n';
import { formatDate } from '#lib/utils/format';
import { lmsIdOf } from '#lib/utils/studentQr';
import type { ArtemisMode, ShareChannelId } from './channels';

export interface ArtemisTarget extends ArtemisCourse {
  mode: ArtemisMode;
}

export interface Delivery {
  /** True when the channel sends the graded PDF itself, so no link is made. */
  sendsPdf: boolean;
  deliverLink(student: StudentRecord, name: string, url: string): Promise<void>;
  deliverPdf(student: StudentRecord, name: string, filename: string, pdf: Uint8Array): Promise<void>;
  /** Sends what was collected; returns a warning per student it could not reach. */
  finish(): Promise<string[]>;
}

/** The server sends a request's mails before answering, so batches stay small enough for the request timeout (it takes up to 100). */
const MAIL_BATCH = 20;

const artemisUser = (student: StudentRecord): number => {
  const id = lmsIdOf(student);
  if (!id) throw new Error(translate('sharing.channels.artemis.missing'));
  return Number(id);
};

export function createDelivery(
  channel: ShareChannelId,
  context: { examTitle: string; expiresAt: Date; artemis?: ArtemisTarget }
): Delivery {
  const none = async () => {};
  if (channel === 'email') {
    const queued: { mail: ResultMail; name: string }[] = [];
    return {
      sendsPdf: false,
      async deliverLink(student, name, url) {
        if (!student.email) throw new Error(translate('sharing.channels.email.missing'));
        queued.push({ mail: { email: student.email, url, expiresAt: context.expiresAt }, name });
      },
      deliverPdf: none,
      async finish() {
        const warnings: string[] = [];
        for (let i = 0; i < queued.length; i += MAIL_BATCH) {
          const batch = queued.slice(i, i + MAIL_BATCH);
          try {
            const failed = await sendResultMails(context.examTitle, get(locale), batch.map((q) => q.mail));
            for (const index of failed) warnings.push(translate('sharing.channels.email.failed', { name: batch[index]?.name ?? '?' }));
          } catch (err) {
            const reason = err instanceof Error ? err.message : '';
            for (const q of batch) warnings.push(`${translate('sharing.channels.email.failed', { name: q.name })} ${reason}`.trim());
          }
        }
        return warnings;
      },
    };
  }
  if (channel === 'artemis') {
    const target = context.artemis;
    if (!target) throw new Error(translate('sharing.channels.artemis.setupMissing'));
    const intro = translate('sharing.channels.artemis.message', { exam: context.examTitle, date: formatDate(context.expiresAt) });
    return {
      sendsPdf: target.mode === 'pdf',
      async deliverLink(student, _name, url) {
        await sendArtemisMessage(target, artemisUser(student), `${intro}\n\n${url}\n\n${translate('sharing.channels.artemis.needsKey')}`);
      },
      async deliverPdf(student, _name, filename, pdf) {
        await sendArtemisFile(target, artemisUser(student), filename, pdf, translate('sharing.channels.artemis.pdfMessage', { exam: context.examTitle }));
      },
      finish: async () => [],
    };
  }
  return { sendsPdf: false, deliverLink: none, deliverPdf: none, finish: async () => [] };
}
