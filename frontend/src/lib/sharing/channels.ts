/** How shared results reach students (issues #207, #209; docs/dev/result_sharing.md). Each channel names the factors it can carry and which students it can reach, so the dialog mutes what does not fit instead of failing later. A channel that hands the link to a third party (our mail server, Artemis) carries only factors with a second secret, so that party can never open the PDF. */

import type { StudentRecord } from '#lib/db/schema';
import type { TranslationKey } from '#lib/i18n/types';
import type { FeatureName } from '#lib/stores/capabilities';
import { lmsIdOf, stickerRawOf } from '#lib/utils/studentQr';
import type { ShareFactor } from './shareCrypto';

export type ShareChannelId = 'slips' | 'email' | 'artemis';

/** Artemis delivers either the link or the graded PDF itself (then Artemis stores the plain PDF). */
export type ArtemisMode = 'link' | 'pdf';

export interface ShareChannel {
  id: ShareChannelId;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  factors: readonly ShareFactor[];
  /** The account switch the channel needs, if any. */
  feature?: FeatureName;
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
  {
    id: 'email',
    labelKey: 'sharing.channels.email.label',
    descriptionKey: 'sharing.channels.email.description',
    factors: ['sticker', 'code'],
    feature: 'result_delivery',
    unreachable: (student) => (student.email ? null : 'sharing.channels.email.missing'),
  },
  {
    id: 'artemis',
    labelKey: 'sharing.channels.artemis.label',
    descriptionKey: 'sharing.channels.artemis.description',
    factors: ['sticker', 'code'],
    feature: 'result_delivery',
    unreachable: (student) => (lmsIdOf(student) ? null : 'sharing.channels.artemis.missing'),
  },
];

/** The channels this account may use. */
export function availableChannels(features: Partial<Record<FeatureName, boolean>>): ShareChannel[] {
  return SHARE_CHANNELS.filter((c) => !c.feature || features[c.feature] === true);
}

export const SHARE_FACTORS: readonly ShareFactor[] = ['none', 'sticker', 'code'];

/** Why *factor* cannot protect *student*'s result, or null when it can. */
export function factorUnavailable(factor: ShareFactor, student: StudentRecord): TranslationKey | null {
  if (factor === 'sticker' && !stickerRawOf(student)) return 'sharing.factor.noSticker';
  return null;
}

/** The students *factor* and *channel* cannot serve, with the reason for each; *factor* null means no link is made (Artemis PDF mode). */
export function incompatibleStudents(
  factor: ShareFactor | null,
  channel: ShareChannel,
  students: readonly StudentRecord[]
): { student: StudentRecord; reason: TranslationKey }[] {
  return students.flatMap((student) => {
    const reason = channel.unreachable(student) ?? (factor ? factorUnavailable(factor, student) : null);
    return reason ? [{ student, reason }] : [];
  });
}
