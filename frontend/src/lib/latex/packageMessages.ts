/** Texts for package notes and entry errors (issue #108); `tr` is `$t`, so they follow the UI language. */
import type { TranslationKey, TranslationVars } from "#lib/i18n";
import {
  FORBIDDEN_PACKAGES,
  LOCKED_PACKAGES,
  type EntryError,
  type PackageNote,
  type SourceRef,
} from "./packages";

type Translate = (key: TranslationKey, vars?: TranslationVars) => string;

const REASON_KEYS: Record<string, TranslationKey> = {
  xetex: "latexPackages.reason.xetex",
  enumitem: "latexPackages.reason.enumitem",
  layout: "latexPackages.reason.layout",
  omr: "latexPackages.reason.omr",
  locked: "latexPackages.reason.locked",
  name: "latexPackages.reason.name",
};

export function reasonText(tr: Translate, reason: string): string {
  return tr(REASON_KEYS[reason] ?? "latexPackages.reason.name");
}

export function sourceText(tr: Translate, ref: SourceRef): string {
  if (ref.source === "exercise") {
    return ref.label
      ? tr("latexPackages.source.exercise", { label: ref.label })
      : tr("latexPackages.source.exerciseUnnamed");
  }
  return tr(`latexPackages.source.${ref.source}`);
}

export function noteText(tr: Translate, note: PackageNote): string {
  const [first, second] = note.sources.map((ref) => sourceText(tr, ref));
  const reason = note.code === "ignored" ? reasonText(tr, note.detail) : "";
  return tr(`latexPackages.note.${note.code}`, { name: note.name, detail: note.detail, first, second, reason });
}

/** Notes that need the teacher's attention, as opposed to ones that only explain the result. */
export const isWarning = (note: PackageNote) => note.code === "conflict" || note.code === "ignored" || note.code === "kept";

export function entryErrorText(tr: Translate, error: EntryError, name: string): string {
  if (error === "forbidden") {
    return tr("latexPackages.error.forbidden", { reason: reasonText(tr, FORBIDDEN_PACKAGES.get(name) ?? "name") });
  }
  if (error === "locked") {
    return tr("latexPackages.error.locked", { reason: reasonText(tr, LOCKED_PACKAGES.get(name) ?? "locked") });
  }
  return tr(`latexPackages.error.${error}`, { name });
}
