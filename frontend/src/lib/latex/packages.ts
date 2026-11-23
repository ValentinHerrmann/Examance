/** LaTeX packages chosen in Examance: account and exercise levels (issue #108). `resolvePackages` merges them into one set without option clashes and `withPackages` writes it before `\documentclass` (packages.sty loads it before hyperref). Rules: docs/dev/latex_packages.md. Mirrors backend/app/services/latex_packages.py; keep in sync. The rule tables come from one file both sides read (`backend/app/services/latex_package_rules.json`). */
import RULES from '../../../../backend/app/services/latex_package_rules.json';

export type PackageKind = "package" | "tikzlibrary" | "pgfplotslibrary";
export type LayerSource = "account" | "exercise" | "auto";
export const PACKAGE_KINDS: readonly PackageKind[] = ["package", "tikzlibrary", "pgfplotslibrary"];

export const MAX_ENTRIES = RULES.maxEntries;
export const MAX_OPTIONS_LENGTH = RULES.maxOptionsLength;
const NAME_PATTERN = new RegExp(`^${RULES.namePattern}$`);
/** Options typed in the settings stay declarative: no commands, comments, parameters or brackets. */
const FORBIDDEN_OPTION_CHARS = /[\\%#[\]\n\r]/;

/** Packages that cannot work with the template, by reason code (`latexPackages.reason.*`). */
export const FORBIDDEN_PACKAGES: ReadonlyMap<string, string> = new Map(Object.entries(RULES.forbidden));
/** Template packages whose options would move the page layout or break the OMR links. */
export const LOCKED_PACKAGES: ReadonlyMap<string, string> = new Map(Object.entries(RULES.locked));
/** Packages replaced by an option of a template package. */
export const PACKAGE_ALIASES: ReadonlyMap<string, readonly [string, string]> = new Map(
  Object.entries(RULES.aliases).map(([name, [target, option]]) => [name, [target, option] as const]),
);
/** Packages that have to load after hyperref. */
export const AFTER_HYPERREF: ReadonlySet<string> = new Set(RULES.afterHyperref);

/** A subject package the template no longer loads by itself: added when the document uses a trigger. */
export interface LazyPackage {
  name: string;
  options: string;
  triggers: readonly string[];
}

/** In load order (tikz-uml before custom-pgf-umlcd); the names may carry a path (sty/tikz-uml). */
export const LAZY_PACKAGES: readonly LazyPackage[] = RULES.lazy;

/** The account's "always load all subject packages" choice (`setAllSubjectPackages`, kept with the account list by packageSettings.ts), so every document builder picks it up without a new parameter. */
let accountAllSubject = false;
export function setAllSubjectPackages(all: boolean): void {
  accountAllSubject = all;
}

export interface LatexPackageEntry {
  kind: PackageKind;
  name: string;
  options: string;
}

export interface SourceRef {
  source: LayerSource;
  label: string;
}

export interface PackageLayer {
  source: LayerSource;
  entries: readonly LatexPackageEntry[];
  label?: string;
}

export type NoteCode = "conflict" | "override" | "ignored" | "aliased" | "added";

/** conflict: two exercises disagree on an option; override: a later level changed one; ignored: unsupported (detail = reason); aliased: replaced by a template option (detail = target); added: a package loaded for others (detail empty: pgfplots for its libraries; used: a subject package the document uses; all: the account loads every subject package). */
export interface PackageNote {
  code: NoteCode;
  kind: PackageKind;
  name: string;
  detail: string;
  sources: SourceRef[];
}

export interface ResolvedPackage {
  kind: PackageKind;
  name: string;
  options: string[];
  sources: SourceRef[];
}

export interface ResolvedPackages {
  packages: ResolvedPackage[];
  notes: PackageNote[];
}

export type EntryError = "kind" | "name" | "options" | "forbidden" | "locked" | "tooMany" | "duplicate";

const BRACE_DELTA: Readonly<Record<string, number>> = { "{": 1, "}": -1 };

function bracesBalanced(text: string): boolean {
  let depth = 0;
  for (const char of text) {
    depth += BRACE_DELTA[char] ?? 0;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Why an entry typed in the settings cannot be stored (`latexPackages.error.*`). */
export function entryError(kind: string, name: string, options: string): EntryError | null {
  if (!PACKAGE_KINDS.includes(kind as PackageKind)) return "kind";
  if (!NAME_PATTERN.test(name)) return "name";
  if (
    options &&
    (kind !== "package" ||
      options.length > MAX_OPTIONS_LENGTH ||
      FORBIDDEN_OPTION_CHARS.test(options) ||
      !bracesBalanced(options))
  )
    return "options";
  if (kind === "package" && FORBIDDEN_PACKAGES.has(name)) return "forbidden";
  if (kind === "package" && LOCKED_PACKAGES.has(name)) return "locked";
  return null;
}

/** Like `entryError` for a whole level, which also may not name a package twice. */
export function entriesError(entries: readonly LatexPackageEntry[]): EntryError | null {
  if (entries.length > MAX_ENTRIES) return "tooMany";
  const seen = new Set<string>();
  for (const entry of entries) {
    const error = entryError(entry.kind, entry.name, entry.options);
    if (error) return error;
    const key = `${entry.kind}:${entry.name}`;
    if (seen.has(key)) return "duplicate";
    seen.add(key);
  }
  return null;
}

/** Entries of an API payload, skipping malformed ones (or a package unsupported since). */
export function storedEntries(value: unknown): LatexPackageEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: LatexPackageEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { kind = "package", name, options = "" } = item as Record<string, unknown>;
    if (typeof kind !== "string" || typeof name !== "string" || typeof options !== "string") continue;
    if (entryError(kind, name, options) !== null) continue;
    entries.push({ kind: kind as PackageKind, name, options });
  }
  return entries;
}

/** Top-level comma-separated items, trimmed, `key = value` written as `key=value`. */
export function splitOptions(options: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of options) {
    depth += BRACE_DELTA[char] ?? 0;
    if (char === "," && depth === 0) {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current);
  const result: string[] = [];
  for (const item of items) {
    const sep = item.indexOf("=");
    const normalized = sep >= 0 ? `${item.slice(0, sep).trim()}=${item.slice(sep + 1).trim()}` : item.trim();
    if (normalized) result.push(normalized);
  }
  return result;
}

// --- Package commands in exercise bodies ------------------------------------------------------------------------

// Built from parts like the backend's `_PACKAGE_COMMAND`: options may hold `{...}` groups but no nested brackets.
const PACKAGE_NAME = String.raw`\\(usepackage|usetikzlibrary|usepgfplotslibrary)\s*`;
const PACKAGE_OPTIONS = String.raw`(?:\[([^[\]{}]*(?:\{[^{}]*\}[^[\]{}]*)*)\]\s*)?`;
const PACKAGE_COMMAND = new RegExp(String.raw`${PACKAGE_NAME}${PACKAGE_OPTIONS}\{([^{}]*)\}`, "g");
const VERBATIM_BEGIN = /\\begin\s*\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}/;
const INLINE_VERBATIM = /\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)(?:\{[^}]*\}|([^\sa-zA-Z{]).*?\1)/g;
const COMMENT = /(?<!\\)%/;
type PackageCommand = "usepackage" | "usetikzlibrary" | "usepgfplotslibrary";
const COMMAND_KIND: Record<PackageCommand, PackageKind> = {
  usepackage: "package",
  usetikzlibrary: "tikzlibrary",
  usepgfplotslibrary: "pgfplotslibrary",
};
const KIND_COMMAND: Record<PackageKind, PackageCommand> = {
  package: "usepackage",
  tikzlibrary: "usetikzlibrary",
  pgfplotslibrary: "usepgfplotslibrary",
};

function splitNames(argument: string): string[] {
  return argument
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const sameEntry = (a: LatexPackageEntry, b: LatexPackageEntry) =>
  a.kind === b.kind && a.name === b.name && a.options === b.options;

function collect(entries: LatexPackageEntry[], code: string): void {
  for (const [, command, rawOptions, rawArgument] of code.matchAll(PACKAGE_COMMAND)) {
    const kind = COMMAND_KIND[command as PackageCommand];
    const options = kind === "package" ? (rawOptions ?? "").trim() : "";
    for (const name of splitNames(rawArgument)) {
      const entry: LatexPackageEntry = { kind, name, options };
      if (!entries.some((e) => sameEntry(e, entry))) entries.push(entry);
    }
  }
}

/** Collects one line's commands outside comments and verbatim; returns an open verbatim end. */
function scanLine(entries: LatexPackageEntry[], code: string): string | null {
  // Whichever comes first, a comment or a verbatim environment, ends the scannable part.
  for (;;) {
    const comment = COMMENT.exec(code);
    const begin = VERBATIM_BEGIN.exec(code);
    if (!begin || (comment && comment.index < begin.index)) {
      collect(entries, comment ? code.slice(0, comment.index) : code);
      return null;
    }
    collect(entries, code.slice(0, begin.index));
    const end = String.raw`\end{${begin[1]}}`;
    const endAt = code.indexOf(end, begin.index + begin[0].length);
    if (endAt < 0) return end;
    code = code.slice(endAt + end.length);
  }
}

/** Package commands in exercise LaTeX, skipping comments and verbatim; one line per command. */
export function exerciseEntries(latex: string): LatexPackageEntry[] {
  const entries: LatexPackageEntry[] = [];
  let verbatimEnd: string | null = null;
  for (const line of latex.split(/\r?\n/)) {
    let code = line.replace(INLINE_VERBATIM, "");
    if (verbatimEnd) {
      const endAt = code.indexOf(verbatimEnd);
      if (endAt < 0) continue;
      code = code.slice(endAt + verbatimEnd.length);
    }
    verbatimEnd = scanLine(entries, code);
  }
  return entries;
}

export function documentBody(doc: string): string {
  const start = doc.indexOf(String.raw`\begin{document}`);
  return start >= 0 ? doc.slice(start) : "";
}

// --- Merging the levels -------------------------------------------------------------------------------------------

function unsupported(kind: PackageKind, name: string): string {
  if (!NAME_PATTERN.test(name)) return "name";
  if (kind === "package") return FORBIDDEN_PACKAGES.get(name) ?? (LOCKED_PACKAGES.has(name) ? "locked" : "");
  return "";
}

interface Merged {
  kind: PackageKind;
  name: string;
  options: Map<string, { item: string; ref: SourceRef }>;
  sources: SourceRef[];
}

const sameRef = (a: SourceRef, b: SourceRef) => a.source === b.source && a.label === b.label;

/** The entry's name and options after aliases (enumerate is enumitem's shortlabels option). */
function dealias(entry: LatexPackageEntry, ref: SourceRef, notes: PackageNote[]): [string, string] {
  const alias = entry.kind === "package" ? PACKAGE_ALIASES.get(entry.name) : undefined;
  if (!alias) return [entry.name, entry.options];
  const [target, option] = alias;
  notes.push({ code: "aliased", kind: entry.kind, name: entry.name, detail: target, sources: [ref] });
  return [target, [option, entry.options].filter(Boolean).join(",")];
}

function mergeOptions(current: Merged, notes: PackageNote[], options: string, ref: SourceRef): void {
  for (const item of splitOptions(options)) {
    const optionKey = item.split("=", 1)[0];
    const previous = current.options.get(optionKey);
    if (previous && previous.item !== item) {
      const bothExercises = previous.ref.source === "exercise" && ref.source === "exercise";
      notes.push({
        code: bothExercises ? "conflict" : "override",
        kind: current.kind,
        name: current.name,
        detail: optionKey,
        sources: [previous.ref, ref],
      });
    }
    current.options.set(optionKey, { item, ref });
  }
}

function apply(merged: Map<string, Merged>, notes: PackageNote[], entry: LatexPackageEntry, ref: SourceRef): void {
  const { kind } = entry;
  const [name, options] = dealias(entry, ref, notes);
  const reason = unsupported(kind, name);
  if (reason) {
    notes.push({ code: "ignored", kind, name, detail: reason, sources: [ref] });
    return;
  }
  const key = `${kind}:${name}`;
  let current = merged.get(key);
  if (!current) {
    current = { kind, name, options: new Map(), sources: [] };
    merged.set(key, current);
  }
  if (!current.sources.some((s) => sameRef(s, ref))) current.sources.push(ref);
  mergeOptions(current, notes, options, ref);
}

/** The lazy packages to load, each with why (`all` or `used`), in load order. */
export function lazyWanted(document: string, allSubject: boolean): [LazyPackage, string][] {
  const wanted: [LazyPackage, string][] = [];
  for (const lazy of LAZY_PACKAGES) {
    if (allSubject) wanted.push([lazy, "all"]);
    else if (lazy.triggers.some((trigger) => document.includes(trigger))) wanted.push([lazy, "used"]);
  }
  return wanted;
}

/** Adds one lazy package with its fixed options; options already given for it win. */
function addLazy(merged: Map<string, Merged>, notes: PackageNote[], lazy: LazyPackage, why: string): void {
  const auto: SourceRef = { source: "auto", label: "" };
  let current = merged.get(`package:${lazy.name}`);
  if (!current) {
    current = { kind: "package", name: lazy.name, options: new Map(), sources: [auto] };
    merged.set(`package:${lazy.name}`, current);
    notes.push({ code: "added", kind: "package", name: lazy.name, detail: why, sources: [auto] });
  }
  for (const item of splitOptions(lazy.options)) {
    const optionKey = item.split("=", 1)[0];
    if (!current.options.has(optionKey)) current.options.set(optionKey, { item, ref: auto });
  }
}

/** Merge the levels in order (account, exercises): later ones override option values. `document` is scanned for the triggers of the lazy subject packages; `allSubject` loads them all. */
export function resolvePackages(layers: readonly PackageLayer[], document = "", allSubject = false): ResolvedPackages {
  const merged = new Map<string, Merged>();
  const notes: PackageNote[] = [];
  for (const layer of layers) {
    const ref: SourceRef = { source: layer.source, label: layer.label ?? "" };
    for (const entry of layer.entries) apply(merged, notes, entry, ref);
  }
  const needsPgfplots = [...merged.values()].some((m) => m.kind === "pgfplotslibrary");
  if (needsPgfplots && !merged.has("package:pgfplots")) {
    const auto: SourceRef = { source: "auto", label: "" };
    merged.set("package:pgfplots", { kind: "package", name: "pgfplots", options: new Map(), sources: [auto] });
    notes.push({ code: "added", kind: "package", name: "pgfplots", detail: "", sources: [auto] });
  }
  for (const [lazy, why] of lazyWanted(document, allSubject)) addLazy(merged, notes, lazy, why);
  const packages = [...merged.values()].map((m) => ({
    kind: m.kind,
    name: m.name,
    options: [...m.options.values()].map((o) => o.item),
    sources: m.sources,
  }));
  return { packages, notes };
}

const LIBRARY_COMMANDS: readonly [PackageKind, PackageCommand][] = [
  ["tikzlibrary", "usetikzlibrary"],
  ["pgfplotslibrary", "usepgfplotslibrary"],
];

/** The lines before `\documentclass`: options first, so no later load can clash. */
export function packagePreamble(resolved: ResolvedPackages): string {
  const packages = resolved.packages.filter((p) => p.kind === "package");
  const options = packages
    .filter((p) => p.options.length)
    .map((p) => String.raw`\PassOptionsToPackage{${p.options.join(",")}}{${p.name}}`);
  const before = packages.filter((p) => !AFTER_HYPERREF.has(p.name)).map((p) => String.raw`  \RequirePackage{${p.name}}%`);
  const after = packages.filter((p) => AFTER_HYPERREF.has(p.name)).map((p) => String.raw`  \RequirePackage{${p.name}}%`);
  for (const [kind, command] of LIBRARY_COMMANDS) {
    const names = resolved.packages.filter((p) => p.kind === kind).map((p) => p.name);
    if (names.length) before.push(`  \\${command}{${names.join(",")}}%`);
  }
  if (!options.length && !before.length && !after.length) return "";
  const lines = ["% LaTeX packages from the Examance settings, the exam and its exercises", ...options];
  if (before.length) lines.push(String.raw`\def\ExamancePackages{%`, ...before, "}");
  if (after.length) lines.push(String.raw`\def\ExamancePackagesAfterHyperref{%`, ...after, "}");
  return `${lines.join("\n")}\n`;
}

/** Write the merged packages of `layers` (plus the subject packages `doc` uses, or all of them) in front of the `\documentclass` of `doc`. */
export function withPackages(doc: string, layers: readonly PackageLayer[], allSubject = accountAllSubject): string {
  const block = packagePreamble(resolvePackages(layers, doc, allSubject));
  if (!block) return doc;
  const found = doc.indexOf(String.raw`\documentclass`);
  const start = Math.max(found, 0);
  return doc.slice(0, start) + block + doc.slice(start);
}

/** The two levels of one document; `exercises` is the LaTeX of all its exercises. */
export function documentLayers(account: readonly LatexPackageEntry[], exercises: string): PackageLayer[] {
  return [
    { source: "account", entries: account },
    { source: "exercise", entries: exerciseEntries(exercises) },
  ];
}

// --- Editing the package lines of an exercise (exercise editor panel) -------------------------------------------------

/** A line of exercise LaTeX that holds nothing but package commands, so the panel may rewrite it. */
export interface PackageLine {
  line: number;
  commands: { kind: PackageKind; options: string; names: string[] }[];
}

const ANY_PACKAGE_COMMAND = /\\use(?:package|tikzlibrary|pgfplotslibrary)/;

/** True for a line that holds nothing but package commands (no regex over the whole line: it would backtrack). */
const onlyPackageCommands = (text: string) => ANY_PACKAGE_COMMAND.test(text) && !text.replace(PACKAGE_COMMAND, "").trim();

/** The editable package lines of `latex`; commands elsewhere (inline, verbatim) stay read-only. */
export function packageLines(latex: string): PackageLine[] {
  const result: PackageLine[] = [];
  const lines = latex.split("\n");
  let verbatimEnd: string | null = null;
  lines.forEach((text, line) => {
    if (verbatimEnd) {
      if (text.includes(verbatimEnd)) verbatimEnd = null;
      return;
    }
    const begin = VERBATIM_BEGIN.exec(text);
    if (begin && !text.includes(String.raw`\end{${begin[1]}}`, begin.index)) verbatimEnd = String.raw`\end{${begin[1]}}`;
    if (!onlyPackageCommands(text)) return;
    const commands = [...text.matchAll(PACKAGE_COMMAND)].map(([, command, rawOptions, rawArgument]) => {
      const kind = COMMAND_KIND[command as PackageCommand];
      return { kind, options: kind === "package" ? (rawOptions ?? "").trim() : "", names: splitNames(rawArgument) };
    });
    result.push({ line, commands });
  });
  return result;
}

function formatCommand(kind: PackageKind, options: string, names: readonly string[]): string {
  const opts = kind === "package" && options ? `[${options}]` : "";
  return `\\${KIND_COMMAND[kind]}${opts}{${names.join(",")}}`;
}

/** One line per entry, as the panel writes them. */
export function formatPackageLine(entry: LatexPackageEntry): string {
  return formatCommand(entry.kind, entry.options, [entry.name]);
}

/** Adds `entry` as a line at the top of the exercise, where the panel keeps its package lines. */
export function addPackageLine(latex: string, entry: LatexPackageEntry): string {
  return `${formatPackageLine(entry)}\n${latex}`;
}

/** Rewrites package line `line` with `name` (of `kind`) removed, or set to `entry` when given. A name shared with others in one command (`\usepackage[x]{a,b}`) is split off first, so only that package changes. */
export function updatePackageLine(
  latex: string,
  line: number,
  kind: PackageKind,
  name: string,
  entry: LatexPackageEntry | null
): string {
  const lines = latex.split("\n");
  const parsed = packageLines(latex).find((p) => p.line === line);
  if (!parsed) return latex;
  const parts: string[] = [];
  for (const command of parsed.commands) {
    const others = command.names.filter((n) => !(command.kind === kind && n === name));
    if (others.length) parts.push(formatCommand(command.kind, command.options, others));
    if (entry && others.length !== command.names.length) parts.push(formatPackageLine(entry));
  }
  const indent = /^\s*/.exec(lines[line])?.[0] ?? "";
  if (parts.length) lines[line] = indent + parts.join(" ");
  else lines.splice(line, 1);
  return lines.join("\n");
}
