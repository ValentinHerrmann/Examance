/**
 * Server side of the LaTeX package settings (issue #108): the account list (`/user/latex-packages`) and what the
 * template loads (`/latex/template-packages`). Merging rules: `lib/latex/packages.ts`.
 */
import { api } from "#lib/api/client";
import { storedEntries, type LatexPackageEntry } from "./packages";

const QUIET = { silentError: true } as const;

export interface TemplatePackage {
  name: string;
  options: string;
  /** The template file that loads it (`packages` is the main list). */
  source: string;
  /** Why its options are fixed (`layout`, `omr`), else null. */
  locked: string | null;
}

export interface TemplatePackages {
  packages: TemplatePackage[];
  tikz_libraries: { name: string; source: string }[];
}

let accountEntries: Promise<LatexPackageEntry[]> | null = null;
let templatePackages: Promise<TemplatePackages> | null = null;

/** The account list, cached per session. Never throws: compiles go on without it and the next call retries. */
export function getAccountPackages(): Promise<LatexPackageEntry[]> {
  accountEntries ??= api
    .get<{ entries: unknown }>("/user/latex-packages", QUIET)
    .then((body) => storedEntries(body.entries))
    .catch((err) => {
      console.warn("[latex-packages] account list unavailable, compiling without it", err);
      accountEntries = null;
      return [];
    });
  return accountEntries;
}

/** Stores the account list; throws on refusal (the settings card shows it). */
export async function saveAccountPackages(entries: readonly LatexPackageEntry[]): Promise<LatexPackageEntry[]> {
  const body = await api.put<{ entries: unknown }>(
    "/user/latex-packages",
    { entries: entries.map(({ kind, name, options }) => ({ kind, name, options })) },
    QUIET
  );
  const saved = storedEntries(body.entries);
  accountEntries = Promise.resolve(saved);
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
}
