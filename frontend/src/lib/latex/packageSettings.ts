/** Server side of the LaTeX package settings (issue #108): the account list (`/user/latex-packages`) and what the template loads (`/latex/template-packages`). Merging rules: `lib/latex/packages.ts`. */
import { api } from "#lib/api/client";
import { setAllSubjectPackages, storedEntries, type LatexPackageEntry } from "./packages";

const QUIET = { silentError: true } as const;

export interface TemplatePackage {
  name: string;
  options: string;
  /** The template file that loads it (`packages` is the main list). */
  source: string;
  /** Why its options are fixed (`layout`, `omr`), else null. */
  locked: string | null;
  /** Loaded only when the document uses it (or the account loads all subject packages). */
  lazy?: boolean;
}

export interface TemplatePackages {
  packages: TemplatePackage[];
  tikz_libraries: { name: string; source: string }[];
}

interface AccountBody {
  entries: unknown;
  all_subject_packages?: boolean;
}

let accountEntries: Promise<LatexPackageEntry[]> | null = null;
let allSubjectSaved = false;
let templatePackages: Promise<TemplatePackages> | null = null;

/** The account list from the server; throws, so an editor never mistakes a failed load for an empty list. */
export async function fetchAccountPackages(): Promise<LatexPackageEntry[]> {
  const body = await api.get<AccountBody>("/user/latex-packages", QUIET);
  const entries = storedEntries(body.entries);
  accountEntries = Promise.resolve(entries);
  allSubjectSaved = body.all_subject_packages === true;
  setAllSubjectPackages(allSubjectSaved);
  return entries;
}

/** The account's "always load all subject packages" choice as last loaded or saved. */
export const getAllSubjectPackages = () => allSubjectSaved;

/** The account list, cached per session. Never throws: compiles go on without it and the next call retries. */
export function getAccountPackages(): Promise<LatexPackageEntry[]> {
  accountEntries ??= fetchAccountPackages()
    .catch((err) => {
      console.warn("[latex-packages] account list unavailable, compiling without it", err);
      accountEntries = null;
      return [];
    });
  return accountEntries;
}

/** Stores the account list and, when given, the "all subject packages" choice (left as it is otherwise); throws on refusal (the settings card shows it). */
export async function saveAccountPackages(
  entries: readonly LatexPackageEntry[],
  allSubject?: boolean
): Promise<LatexPackageEntry[]> {
  const body = await api.put<AccountBody>(
    "/user/latex-packages",
    {
      entries: entries.map(({ kind, name, options }) => ({ kind, name, options })),
      ...(allSubject === undefined ? {} : { all_subject_packages: allSubject }),
    },
    QUIET
  );
  const saved = storedEntries(body.entries);
  accountEntries = Promise.resolve(saved);
  allSubjectSaved = body.all_subject_packages === true;
  setAllSubjectPackages(allSubjectSaved);
  return saved;
}

/** What the template loads by itself; static per deployment, so cached until reload. */
export function getTemplatePackages(): Promise<TemplatePackages> {
  templatePackages ??= api.get<TemplatePackages>("/latex/template-packages", QUIET).catch((err) => {
    templatePackages = null;
    throw err;
  });
  return templatePackages;
}

/** Called with the compile cache on lock and logout, so another account never sees this one's list. */
export function clearPackageSettingsCache(): void {
  accountEntries = null;
  allSubjectSaved = false;
  setAllSubjectPackages(false);
}
