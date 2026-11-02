/** How shared results reach students (issue #207, docs/dev/result_sharing.md). Each channel names the factors it can carry and which students it can reach, so the dialog mutes what does not fit instead of failing later. Add e-mail, Artemis or Moodle here. */

import type { StudentRecord } from '#lib/db/schema';
import type { TranslationKey } from '#lib/i18n/types';
import { stickerRawOf } from '#lib/utils/studentQr';
import type { ShareFactor } from './shareCrypto';

export type ShareChannelId = 'slips';

export interface ShareChannel {
  id: ShareChannelId;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  factors: readonly ShareFactor[];
  /** Why this channel cannot reach *student*, or null when it can. */
  unreachable(student: StudentRecord): TranslationKey | null;
}

export const SHARE_CHANNELS: readonly ShareChannel[] = [
  {
    id: 'slips',
    labelKey: 'sharing.channels.slips.label',
    descriptionKey: 'sharing.channels.slips.description',
    factors: ['none', 'sticker', 'code'],
    unreachable: () => null,
  },
];

export const SHARE_FACTORS: readonly ShareFactor[] = ['none', 'sticker', 'code'];

/** Why *factor* cannot protect *student*'s result, or null when it can. */
export function factorUnavailable(factor: ShareFactor, student: StudentRecord): TranslationKey | null {
  if (factor === 'sticker' && !stickerRawOf(student)) return 'sharing.factor.noSticker';
  return null;
}

/** The students *factor* and *channel* cannot serve, with the reason for each. */
export function incompatibleStudents(
  factor: ShareFactor,
  channel: ShareChannel,
  students: readonly StudentRecord[]
): { student: StudentRecord; reason: TranslationKey }[] {
  return students.flatMap((student) => {
    const reason = channel.unreachable(student) ?? factorUnavailable(factor, student);
    return reason ? [{ student, reason }] : [];
  });
}
