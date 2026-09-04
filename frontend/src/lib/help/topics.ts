import type { TranslationKey } from "$lib/i18n";

/**
 * The in-app manual, as data.
 *
 * Content itself lives in the `help` i18n namespace (German is the source of
 * truth); this registry only fixes the *order* of headings and paragraphs,
 * because the catalogs hold no arrays. Every key is `TranslationKey`-typed, so
 * a typo here is a `svelte-check` error rather than a blank paragraph.
 *
 * One registry feeds all three surfaces: the help modal, the `/help` route and
 * the contextual `?` buttons.
 */
export type HelpTopicId =
  | "gettingStarted"
  | "storageModes"
  | "exercises"
  | "examCreation"
  | "scanning"
  | "grading"
  | "stats"
  | "analytics"
  | "settings"
  | "security"
  | "accounts"
  | "privacy";

export interface HelpSection {
  headingKey: TranslationKey;
  /** Paragraphs, in order. */
  bodyKeys: TranslationKey[];
  /** Bullet list rendered after the paragraphs. */
  bulletKeys?: TranslationKey[];
}

export interface HelpTopic {
  id: HelpTopicId;
  icon: string;
  titleKey: TranslationKey;
  summaryKey: TranslationKey;
  sections: HelpSection[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "gettingStarted",
    icon: "🚀",
    titleKey: "help.topics.gettingStarted.title",
    summaryKey: "help.topics.gettingStarted.summary",
    sections: [
      {
        headingKey: "help.topics.gettingStarted.s1.h",
        bodyKeys: ["help.topics.gettingStarted.s1.p1", "help.topics.gettingStarted.s1.p2"],
      },
      {
        headingKey: "help.topics.gettingStarted.s2.h",
        bodyKeys: [],
        bulletKeys: [
          "help.topics.gettingStarted.s2.l1",
          "help.topics.gettingStarted.s2.l2",
          "help.topics.gettingStarted.s2.l3",
          "help.topics.gettingStarted.s2.l4",
          "help.topics.gettingStarted.s2.l5",
        ],
      },
      {
        headingKey: "help.topics.gettingStarted.s3.h",
        bodyKeys: ["help.topics.gettingStarted.s3.p1"],
      },
    ],
  },
  {
    id: "storageModes",
    icon: "🗄️",
    titleKey: "help.topics.storageModes.title",
    summaryKey: "help.topics.storageModes.summary",
    sections: [
      {
        headingKey: "help.topics.storageModes.s1.h",
        bodyKeys: [],
        bulletKeys: [
          "help.topics.storageModes.s1.l1",
          "help.topics.storageModes.s1.l2",
          "help.topics.storageModes.s1.l3",
        ],
      },
      {
        headingKey: "help.topics.storageModes.s2.h",
        bodyKeys: ["help.topics.storageModes.s2.p1", "help.topics.storageModes.s2.p2"],
      },
      {
        headingKey: "help.topics.storageModes.s3.h",
        bodyKeys: ["help.topics.storageModes.s3.p1"],
      },
    ],
  },
  {
    id: "exercises",
    icon: "📚",
    titleKey: "help.topics.exercises.title",
    summaryKey: "help.topics.exercises.summary",
    sections: [
      {
        headingKey: "help.topics.exercises.s1.h",
        bodyKeys: ["help.topics.exercises.s1.p1", "help.topics.exercises.s1.p2"],
      },
      {
        headingKey: "help.topics.exercises.s2.h",
        bodyKeys: ["help.topics.exercises.s2.p1", "help.topics.exercises.s2.p2"],
      },
      {
        headingKey: "help.topics.exercises.s3.h",
        bodyKeys: ["help.topics.exercises.s3.p1", "help.topics.exercises.s3.p2"],
      },
      {
        headingKey: "help.topics.exercises.s4.h",
        bodyKeys: ["help.topics.exercises.s4.p1", "help.topics.exercises.s4.p2"],
      },
    ],
  },
  {
    id: "examCreation",
    icon: "📝",
    titleKey: "help.topics.examCreation.title",
    summaryKey: "help.topics.examCreation.summary",
    sections: [
      {
        headingKey: "help.topics.examCreation.s1.h",
        bodyKeys: ["help.topics.examCreation.s1.p1"],
      },
      {
        headingKey: "help.topics.examCreation.s2.h",
        bodyKeys: ["help.topics.examCreation.s2.p1"],
      },
      {
        headingKey: "help.topics.examCreation.s3.h",
        bodyKeys: ["help.topics.examCreation.s3.p1"],
      },
      {
        headingKey: "help.topics.examCreation.s4.h",
        bodyKeys: ["help.topics.examCreation.s4.p1", "help.topics.examCreation.s4.p2"],
      },
    ],
  },
  {
    id: "scanning",
    icon: "📷",
    titleKey: "help.topics.scanning.title",
    summaryKey: "help.topics.scanning.summary",
    sections: [
      {
        headingKey: "help.topics.scanning.s1.h",
        bodyKeys: ["help.topics.scanning.s1.p1", "help.topics.scanning.s1.p2"],
      },
      {
        headingKey: "help.topics.scanning.s2.h",
        bodyKeys: ["help.topics.scanning.s2.p1"],
      },
      {
        headingKey: "help.topics.scanning.s3.h",
        bodyKeys: ["help.topics.scanning.s3.p1"],
      },
    ],
  },
  {
    id: "grading",
    icon: "✍️",
    titleKey: "help.topics.grading.title",
    summaryKey: "help.topics.grading.summary",
    sections: [
      {
        headingKey: "help.topics.grading.s1.h",
        bodyKeys: ["help.topics.grading.s1.p1"],
      },
      {
        headingKey: "help.topics.grading.s2.h",
        bodyKeys: ["help.topics.grading.s2.p1", "help.topics.grading.s2.p2"],
      },
      {
        headingKey: "help.topics.grading.s3.h",
        bodyKeys: ["help.topics.grading.s3.p1"],
      },
      {
        headingKey: "help.topics.grading.s4.h",
        bodyKeys: ["help.topics.grading.s4.p1"],
      },
    ],
  },
  {
    id: "stats",
    icon: "📊",
    titleKey: "help.topics.stats.title",
    summaryKey: "help.topics.stats.summary",
    sections: [
      { headingKey: "help.topics.stats.s1.h", bodyKeys: ["help.topics.stats.s1.p1"] },
      { headingKey: "help.topics.stats.s2.h", bodyKeys: ["help.topics.stats.s2.p1"] },
      { headingKey: "help.topics.stats.s3.h", bodyKeys: ["help.topics.stats.s3.p1"] },
    ],
  },
  {
    id: "analytics",
    icon: "📈",
    titleKey: "help.topics.analytics.title",
    summaryKey: "help.topics.analytics.summary",
    sections: [
      { headingKey: "help.topics.analytics.s1.h", bodyKeys: ["help.topics.analytics.s1.p1"] },
      { headingKey: "help.topics.analytics.s2.h", bodyKeys: ["help.topics.analytics.s2.p1"] },
      { headingKey: "help.topics.analytics.s3.h", bodyKeys: ["help.topics.analytics.s3.p1"] },
    ],
  },
  {
    id: "settings",
    icon: "⚙️",
    titleKey: "help.topics.settings.title",
    summaryKey: "help.topics.settings.summary",
    sections: [
      { headingKey: "help.topics.settings.s1.h", bodyKeys: ["help.topics.settings.s1.p1"] },
      {
        headingKey: "help.topics.settings.s2.h",
        bodyKeys: ["help.topics.settings.s2.p1", "help.topics.settings.s2.p2"],
      },
      { headingKey: "help.topics.settings.s3.h", bodyKeys: ["help.topics.settings.s3.p1"] },
      {
        headingKey: "help.topics.settings.s4.h",
        bodyKeys: ["help.topics.settings.s4.p1", "help.topics.settings.s4.p2"],
      },
    ],
  },
  {
    id: "security",
    icon: "🔐",
    titleKey: "help.topics.security.title",
    summaryKey: "help.topics.security.summary",
    sections: [
      { headingKey: "help.topics.security.s1.h", bodyKeys: ["help.topics.security.s1.p1"] },
      {
        headingKey: "help.topics.security.s2.h",
        bodyKeys: ["help.topics.security.s2.p1", "help.topics.security.s2.p2"],
      },
      {
        headingKey: "help.topics.security.s3.h",
        bodyKeys: ["help.topics.security.s3.p1", "help.topics.security.s3.p2"],
      },
      { headingKey: "help.topics.security.s4.h", bodyKeys: ["help.topics.security.s4.p1"] },
    ],
  },
  {
    id: "accounts",
    icon: "👥",
    titleKey: "help.topics.accounts.title",
    summaryKey: "help.topics.accounts.summary",
    sections: [
      { headingKey: "help.topics.accounts.s1.h", bodyKeys: ["help.topics.accounts.s1.p1"] },
      { headingKey: "help.topics.accounts.s2.h", bodyKeys: ["help.topics.accounts.s2.p1"] },
      {
        headingKey: "help.topics.accounts.s6.h",
        bodyKeys: ["help.topics.accounts.s6.p1", "help.topics.accounts.s6.p2"],
      },
      {
        headingKey: "help.topics.accounts.s7.h",
        bodyKeys: ["help.topics.accounts.s7.p1", "help.topics.accounts.s7.p2"],
      },
      { headingKey: "help.topics.accounts.s3.h", bodyKeys: ["help.topics.accounts.s3.p1"] },
      {
        headingKey: "help.topics.accounts.s4.h",
        bodyKeys: ["help.topics.accounts.s4.p1", "help.topics.accounts.s4.p2"],
      },
      { headingKey: "help.topics.accounts.s5.h", bodyKeys: ["help.topics.accounts.s5.p1"] },
    ],
  },
  {
    id: "privacy",
    icon: "🔒",
    titleKey: "help.topics.privacy.title",
    summaryKey: "help.topics.privacy.summary",
    sections: [
      {
        headingKey: "help.topics.privacy.s1.h",
        bodyKeys: ["help.topics.privacy.s1.p1", "help.topics.privacy.s1.p2"],
      },
      { headingKey: "help.topics.privacy.s2.h", bodyKeys: ["help.topics.privacy.s2.p1"] },
      { headingKey: "help.topics.privacy.s3.h", bodyKeys: ["help.topics.privacy.s3.p1"] },
      { headingKey: "help.topics.privacy.s4.h", bodyKeys: ["help.topics.privacy.s4.p1"] },
    ],
  },
];

export function getHelpTopic(id: HelpTopicId): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.id === id);
}

/**
 * The topic a page opens by default. Matched on the plain pathname, the same
 * way `lib/stores/navigationStore.ts` does it — no route-id lookup needed.
 */
export function topicForPath(pathname: string): HelpTopicId {
  if (pathname.startsWith("/exercises")) return "exercises";
  if (pathname.startsWith("/exam/new")) return "examCreation";
  if (pathname.startsWith("/exam/")) {
    if (pathname.includes("/scan") || pathname.includes("/verify")) return "scanning";
    if (pathname.endsWith("/grade") || pathname.endsWith("/manual")) return "grading";
    if (pathname.endsWith("/stats")) return "stats";
    return "examCreation";
  }
  if (pathname.startsWith("/analytics")) return "analytics";
  if (pathname.startsWith("/settings/security")) return "security";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/admin")) return "accounts";
  if (pathname.startsWith("/legal")) return "privacy";
  if (pathname.startsWith("/unlock") || pathname.startsWith("/forgot-password")) return "accounts";
  return "gettingStarted";
}
