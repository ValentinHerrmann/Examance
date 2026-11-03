/** How shared results reach students (issues #207, #209; docs/dev/result_sharing.md). Each channel names the factors it can carry and which students it can reach, so the dialog mutes what does not fit instead of failing later. A channel that hands the link to a third party (our mail server, Artemis) carries only factors with a second secret, so that party can never open the PDF. */

import type { StudentRecord } from '#lib/db/schema';
import type { TranslationKey } from '#lib/i18n/types';
import type { FeatureName } from '#lib/stores/capabilities';
import { lmsIdOf, stickerRawOf } from '#lib/utils/studentQr';
import type { ShareFactor } from './shareCrypto';

export type ShareChannelId = 'slips' | 'email' | 'artemis' | 'mebis';

/** Artemis delivers either the link or the graded PDF itself (then Artemis stores the plain PDF). */
export type ArtemisMode = 'link' | 'pdf';

export interface ShareChannel {
  id: ShareChannelId;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  factors: readonly ShareFactor[];
  /** What the account and server must allow, each with the reason shown when it does not. */
  requires?: readonly { feature: FeatureName; reason: TranslationKey }[];
  /** Why this channel cannot reach *student*, or null when it can. */
  unreachable(student: StudentRecord): TranslationKey | null;
}

const SWITCH = { feature: 'result_delivery', reason: 'sharing.channels.unavailable.switchOff' } as const;

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
    requires: [SWITCH, { feature: 'result_mail', reason: 'sharing.channels.unavailable.noMailServer' }],
    unreachable: (student) => (student.email ? null : 'sharing.channels.email.missing'),
  },
  {
    id: 'artemis',
    labelKey: 'sharing.channels.artemis.label',
    descriptionKey: 'sharing.channels.artemis.description',
    factors: ['sticker', 'code'],
    requires: [SWITCH],
    unreachable: (student) => (lmsIdOf(student) ? null : 'sharing.channels.artemis.missing'),
  },
  {
    // The graded PDFs themselves, zipped for the Mebis assignment's feedback upload; made in the browser, so no switch applies.
    id: 'mebis',
    labelKey: 'sharing.channels.mebis.label',
    descriptionKey: 'sharing.channels.mebis.description',
    factors: [],
    unreachable: (student) => (lmsIdOf(student) ? null : 'sharing.channels.mebis.missing'),
  },
];

/** Why this account or server cannot use *channel*, or null when it can: the dialog greys it out with the reason instead of hiding it. */
export function channelUnavailable(channel: ShareChannel, features: Partial<Record<FeatureName, boolean>>): TranslationKey | null {
  return channel.requires?.find((r) => features[r.feature] !== true)?.reason ?? null;
}

/** Channels that send the PDF itself rather than a link: no factor and no solution apply. */
export function sendsPdf(channel: ShareChannelId, artemisMode: ArtemisMode): boolean {
  return channel === 'mebis' || (channel === 'artemis' && artemisMode === 'pdf');
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
