import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  faBook,
  faCamera,
  faChartColumn,
  faChartLine,
  faDatabase,
  faFilePen,
  faGear,
  faKey,
  faLock,
  faPenToSquare,
  faRocket,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import type { TranslationKey } from "#lib/i18n";
import type { DocsPath } from "./docsLink";

/** The in-app manual as data: a quick pointer per screen, each section linking its user-guide section (`docs`) for the details. Content lives in the `help` i18n namespace (German is the source); this registry only fixes the order of headings and paragraphs, with `TranslationKey`-typed keys so a typo is a `svelte-check` error. Feeds the help modal, the `/help` route and the contextual `?` buttons. */
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
  /** The user-guide section with the details; the help itself stays a quick pointer. */
  docs: DocsPath;
}

export interface HelpTopic {
  id: HelpTopicId;
  icon: IconDefinition;
  titleKey: TranslationKey;
  summaryKey: TranslationKey;
  /** The user-guide page (or section) covering the whole topic. */
  docs: DocsPath;
  sections: HelpSection[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "gettingStarted",
    icon: faRocket,
    titleKey: "help.topics.gettingStarted.title",
    summaryKey: "help.topics.gettingStarted.summary",
    docs: "",
    sections: [
      { headingKey: "help.topics.gettingStarted.s1.h", bodyKeys: ["help.topics.gettingStarted.s1.p1", "help.topics.gettingStarted.s1.p2", "help.topics.gettingStarted.s1.p3"], docs: "" },
      { headingKey: "help.topics.gettingStarted.s2.h", bodyKeys: [], bulletKeys: ["help.topics.gettingStarted.s2.l1", "help.topics.gettingStarted.s2.l2", "help.topics.gettingStarted.s2.l3", "help.topics.gettingStarted.s2.l4", "help.topics.gettingStarted.s2.l5"], docs: "workflow" },
      { headingKey: "help.topics.gettingStarted.s3.h", bodyKeys: ["help.topics.gettingStarted.s3.p1", "help.topics.gettingStarted.s3.p2"], docs: "#help-and-docs" },
      { headingKey: "help.topics.gettingStarted.s4.h", bodyKeys: ["help.topics.gettingStarted.s4.p1"], docs: "backup" },
    ],
  },
  {
    id: "storageModes",
    icon: faDatabase,
    titleKey: "help.topics.storageModes.title",
    summaryKey: "help.topics.storageModes.summary",
    docs: "settings#storage",
    sections: [
      { headingKey: "help.topics.storageModes.s1.h", bodyKeys: [], bulletKeys: ["help.topics.storageModes.s1.l1", "help.topics.storageModes.s1.l2", "help.topics.storageModes.s1.l3"], docs: "settings#storage" },
      { headingKey: "help.topics.storageModes.s2.h", bodyKeys: ["help.topics.storageModes.s2.p1"], docs: "security#encryption" },
      { headingKey: "help.topics.storageModes.s3.h", bodyKeys: ["help.topics.storageModes.s3.p1"], docs: "settings#switching" },
      { headingKey: "help.topics.storageModes.s4.h", bodyKeys: ["help.topics.storageModes.s4.p1"], docs: "settings#notices" },
      { headingKey: "help.topics.storageModes.s5.h", bodyKeys: ["help.topics.storageModes.s5.p1"], docs: "settings#restore" },
    ],
  },
  {
    id: "exercises",
    icon: faBook,
    titleKey: "help.topics.exercises.title",
    summaryKey: "help.topics.exercises.summary",
    docs: "exercises",
    sections: [
      { headingKey: "help.topics.exercises.s1.h", bodyKeys: ["help.topics.exercises.s1.p1"], docs: "exercises#library" },
      { headingKey: "help.topics.exercises.s2.h", bodyKeys: ["help.topics.exercises.s2.p1"], docs: "exercises#editor" },
      { headingKey: "help.topics.exercises.s3.h", bodyKeys: ["help.topics.exercises.s3.p1", "help.topics.exercises.s3.p2"], docs: "exercises#score" },
      { headingKey: "help.topics.exercises.s4.h", bodyKeys: ["help.topics.exercises.s4.p1"], docs: "exercises#variants" },
      { headingKey: "help.topics.exercises.s5.h", bodyKeys: ["help.topics.exercises.s5.p1"], docs: "exercises#multiple-choice" },
      { headingKey: "help.topics.exercises.s6.h", bodyKeys: ["help.topics.exercises.s6.p1"], docs: "exercises#packages" },
      { headingKey: "help.topics.exercises.s7.h", bodyKeys: ["help.topics.exercises.s7.p1"], docs: "exercises#compile-errors" },
      { headingKey: "help.topics.exercises.s8.h", bodyKeys: ["help.topics.exercises.s8.p1"], docs: "sharing#share" },
      { headingKey: "help.topics.exercises.s9.h", bodyKeys: ["help.topics.exercises.s9.p1"], docs: "sharing#proposals" },
      { headingKey: "help.topics.exercises.s10.h", bodyKeys: ["help.topics.exercises.s10.p1"], docs: "exercises#export" },
    ],
  },
  {
    id: "examCreation",
    icon: faFilePen,
    titleKey: "help.topics.examCreation.title",
    summaryKey: "help.topics.examCreation.summary",
    docs: "exams",
    sections: [
      { headingKey: "help.topics.examCreation.s1.h", bodyKeys: ["help.topics.examCreation.s1.p1"], docs: "exams#header" },
      { headingKey: "help.topics.examCreation.s2.h", bodyKeys: ["help.topics.examCreation.s2.p1", "help.topics.examCreation.s2.p2"], docs: "exams#assemble" },
      { headingKey: "help.topics.examCreation.s3.h", bodyKeys: ["help.topics.examCreation.s3.p1"], docs: "exams#grading-key" },
      { headingKey: "help.topics.examCreation.s4.h", bodyKeys: ["help.topics.examCreation.s4.p1"], docs: "exams#layout" },
      { headingKey: "help.topics.examCreation.s5.h", bodyKeys: ["help.topics.examCreation.s5.p1"], docs: "exams#typeset" },
    ],
  },
  {
    id: "scanning",
    icon: faCamera,
    titleKey: "help.topics.scanning.title",
    summaryKey: "help.topics.scanning.summary",
    docs: "scanning",
    sections: [
      { headingKey: "help.topics.scanning.s1.h", bodyKeys: ["help.topics.scanning.s1.p1"], docs: "scanning#import" },
      { headingKey: "help.topics.scanning.s2.h", bodyKeys: ["help.topics.scanning.s2.p1"], docs: "scanning#pseudonyms" },
      { headingKey: "help.topics.scanning.s3.h", bodyKeys: ["help.topics.scanning.s3.p1"], docs: "scanning#assignment" },
      { headingKey: "help.topics.scanning.s4.h", bodyKeys: ["help.topics.scanning.s4.p1"], docs: "scanning#mc-verification" },
      { headingKey: "help.topics.scanning.s5.h", bodyKeys: ["help.topics.scanning.s5.p1"], docs: "scanning#rerun" },
    ],
  },
  {
    id: "grading",
    icon: faPenToSquare,
    titleKey: "help.topics.grading.title",
    summaryKey: "help.topics.grading.summary",
    docs: "grading",
    sections: [
      { headingKey: "help.topics.grading.s1.h", bodyKeys: ["help.topics.grading.s1.p1"], docs: "grading#blind" },
      { headingKey: "help.topics.grading.s2.h", bodyKeys: ["help.topics.grading.s2.p1", "help.topics.grading.s2.p2"], docs: "grading#tools" },
      { headingKey: "help.topics.grading.s6.h", bodyKeys: ["help.topics.grading.s6.p1"], docs: "grading#parts" },
      { headingKey: "help.topics.grading.s3.h", bodyKeys: ["help.topics.grading.s3.p1"], docs: "grading#multiple-choice" },
      { headingKey: "help.topics.grading.s4.h", bodyKeys: ["help.topics.grading.s4.p1"], docs: "grading#paper" },
      { headingKey: "help.topics.grading.s5.h", bodyKeys: ["help.topics.grading.s5.p1"], docs: "grading#saving" },
    ],
  },
  {
    id: "stats",
    icon: faChartColumn,
    titleKey: "help.topics.stats.title",
    summaryKey: "help.topics.stats.summary",
    docs: "results",
    sections: [
      { headingKey: "help.topics.stats.s1.h", bodyKeys: ["help.topics.stats.s1.p1"], docs: "results#distribution" },
      { headingKey: "help.topics.stats.s2.h", bodyKeys: ["help.topics.stats.s2.p1"], docs: "results#borderline" },
      { headingKey: "help.topics.stats.s3.h", bodyKeys: ["help.topics.stats.s3.p1"], docs: "results#partial" },
      { headingKey: "help.topics.stats.s4.h", bodyKeys: ["help.topics.stats.s4.p1"], docs: "results#export" },
    ],
  },
  {
    id: "analytics",
    icon: faChartLine,
    titleKey: "help.topics.analytics.title",
    summaryKey: "help.topics.analytics.summary",
    docs: "results#analytics",
    sections: [
      { headingKey: "help.topics.analytics.s1.h", bodyKeys: ["help.topics.analytics.s1.p1"], docs: "results#analytics" },
      { headingKey: "help.topics.analytics.s2.h", bodyKeys: ["help.topics.analytics.s2.p1"], docs: "results#topics" },
      { headingKey: "help.topics.analytics.s3.h", bodyKeys: ["help.topics.analytics.s3.p1"], docs: "results#variant-fairness" },
    ],
  },
  {
    id: "settings",
    icon: faGear,
    titleKey: "help.topics.settings.title",
    summaryKey: "help.topics.settings.summary",
    docs: "settings",
    sections: [
      { headingKey: "help.topics.settings.s1.h", bodyKeys: ["help.topics.settings.s1.p1"], docs: "settings#storage" },
      { headingKey: "help.topics.settings.s2.h", bodyKeys: ["help.topics.settings.s2.p1"], docs: "settings#latex" },
      { headingKey: "help.topics.settings.s3.h", bodyKeys: ["help.topics.settings.s3.p1"], docs: "settings#language" },
      { headingKey: "help.topics.settings.s4.h", bodyKeys: ["help.topics.settings.s4.p1"], docs: "settings#logo" },
      { headingKey: "help.topics.settings.s5.h", bodyKeys: ["help.topics.settings.s5.p1"], docs: "settings#mc-detection" },
      { headingKey: "help.topics.settings.s6.h", bodyKeys: ["help.topics.settings.s6.p1"], docs: "settings#donation" },
      { headingKey: "help.topics.settings.s7.h", bodyKeys: ["help.topics.settings.s7.p1"], docs: "settings#deletion" },
      { headingKey: "help.topics.settings.s8.h", bodyKeys: ["help.topics.settings.s8.p1"], docs: "settings#maintenance" },
    ],
  },
  {
    id: "security",
    icon: faKey,
    titleKey: "help.topics.security.title",
    summaryKey: "help.topics.security.summary",
    docs: "security",
    sections: [
      { headingKey: "help.topics.security.s1.h", bodyKeys: ["help.topics.security.s1.p1"], docs: "security#security-page" },
      { headingKey: "help.topics.security.s2.h", bodyKeys: ["help.topics.security.s2.p1"], docs: "security#change-password" },
      { headingKey: "help.topics.security.s3.h", bodyKeys: ["help.topics.security.s3.p1"], docs: "security#codes" },
      { headingKey: "help.topics.security.s4.h", bodyKeys: ["help.topics.security.s4.p1"], docs: "security#remove-factor" },
    ],
  },
  {
    id: "accounts",
    icon: faUsers,
    titleKey: "help.topics.accounts.title",
    summaryKey: "help.topics.accounts.summary",
    docs: "#account",
    sections: [
      { headingKey: "help.topics.accounts.s1.h", bodyKeys: ["help.topics.accounts.s1.p1"], docs: "#account" },
      { headingKey: "help.topics.accounts.s2.h", bodyKeys: ["help.topics.accounts.s2.p1"], docs: "admin#features" },
      { headingKey: "help.topics.accounts.s3.h", bodyKeys: ["help.topics.accounts.s3.p1"], docs: "security#factors" },
      { headingKey: "help.topics.accounts.s4.h", bodyKeys: ["help.topics.accounts.s4.p1"], docs: "security#passkeys" },
      { headingKey: "help.topics.accounts.s5.h", bodyKeys: ["help.topics.accounts.s5.p1"], docs: "security#reset-password" },
      { headingKey: "help.topics.accounts.s12.h", bodyKeys: ["help.topics.accounts.s12.p1"], docs: "security#key-copy" },
      { headingKey: "help.topics.accounts.s6.h", bodyKeys: ["help.topics.accounts.s6.p1"], docs: "security#recovery-code" },
      { headingKey: "help.topics.accounts.s7.h", bodyKeys: ["help.topics.accounts.s7.p1"], docs: "security#lockout" },
      { headingKey: "help.topics.accounts.s8.h", bodyKeys: ["help.topics.accounts.s8.p1"], docs: "admin#roles" },
      { headingKey: "help.topics.accounts.s9.h", bodyKeys: ["help.topics.accounts.s9.p1"], docs: "admin#invite" },
      { headingKey: "help.topics.accounts.s10.h", bodyKeys: ["help.topics.accounts.s10.p1"], docs: "admin#layout-reports" },
      { headingKey: "help.topics.accounts.s11.h", bodyKeys: ["help.topics.accounts.s11.p1"], docs: "admin#maintenance" },
    ],
  },
  {
    id: "privacy",
    icon: faLock,
    titleKey: "help.topics.privacy.title",
    summaryKey: "help.topics.privacy.summary",
    docs: "security#encryption",
    sections: [
      { headingKey: "help.topics.privacy.s1.h", bodyKeys: ["help.topics.privacy.s1.p1"], docs: "security#encryption" },
      { headingKey: "help.topics.privacy.s2.h", bodyKeys: ["help.topics.privacy.s2.p1"], docs: "settings#session" },
      { headingKey: "help.topics.privacy.s3.h", bodyKeys: ["help.topics.privacy.s3.p1"], docs: "security#retention" },
      { headingKey: "help.topics.privacy.s4.h", bodyKeys: ["help.topics.privacy.s4.p1"], docs: "security#recovery-code" },
    ],
  },
];

export function getHelpTopic(id: HelpTopicId): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.id === id);
}

/** The topic a page opens by default. Matched on the plain pathname, the same way `lib/stores/navigationStore.ts` does it — no route-id lookup needed. */
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
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/admin")) return "accounts";
  if (pathname.startsWith("/legal")) return "privacy";
  if (
    pathname.startsWith("/unlock") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/verify-email")
  )
    return "accounts";
  return "gettingStarted";
}
