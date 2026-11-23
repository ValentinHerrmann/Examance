/** Layout templates of the Layout step (issues #272, #279): four slots that set every Layout-page setting but the logo; each account can overwrite, rename and reset them (`/user/layout-templates`). The page marks the slot the current choices match. Built-ins are everyday ways of working, not a tour of every option. */

import { api } from '#lib/api/client';
import type { ExamRecord, ExtraNotes } from '#lib/db/schema';
import { extraNotesKey } from '#lib/db/schema';
import { clampExtraPages, printSettingsOf } from '#lib/exam/printLayout';
import { LAYOUT_FIELDS, LAYOUT_TEXT_FIELDS, type LayoutChoiceField, type LayoutField, type LayoutTextField } from '#lib/exam/saveExamLayout';

export const LAYOUT_PRESET_IDS = ['examanceBooklet', 'examanceAnonymous', 'paperAnonymous', 'paperClassic'] as const;
export type LayoutPresetId = (typeof LAYOUT_PRESET_IDS)[number];

/** What a template sets: every choice, and the free text only when a teacher saved it into the template. */
export type PresetFields = Required<Pick<ExamRecord, LayoutChoiceField>> & Partial<Pick<ExamRecord, LayoutTextField>>;

const COMMON = { mcCorrectionHint: true, paperStyle: 'squared', extraPages: 0, dottedFields: false } as const;
const DIGITAL = { ...COMMON, digitalGrading: true, resultsQrBox: false, cutCorner: true, foldStrip: true, pageCodes: true, nameLine: false } as const;
const PAPER = { ...COMMON, digitalGrading: false, foldStrip: false, pageCodes: false, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'cover' } as const;

export const LAYOUT_PRESETS: readonly { id: LayoutPresetId; fields: PresetFields }[] = [
  // Scanned A3 booklets with every scan aid; each copy carries its student's printed QR code.
  { id: 'examanceBooklet', fields: { ...DIGITAL, printLayout: 'booklet', printMode: 'copies', stickerSpots: 'cover' } },
  // Scanned and graded anonymously: identical double-sided copies, a QR sticker on every sheet.
  { id: 'examanceAnonymous', fields: { ...DIGITAL, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'sheet' } },
  // Graded by hand but anonymously: a QR sticker on the cover, the name on the corner cut off before grading.
  { id: 'paperAnonymous', fields: { ...PAPER, resultsQrBox: true, cutCorner: true, nameLine: false } },
  // The classic paper test: no scan aids, no QR code, the students write their names.
  { id: 'paperClassic', fields: { ...PAPER, resultsQrBox: false, cutCorner: false, nameLine: true } },
];

/** A slot as the account stored it (`/user/layout-templates`); absent parts keep the built-in's. */
export interface StoredLayoutTemplate {
  id: LayoutPresetId;
  title?: string | null;
  text?: string | null;
  fields?: Partial<Record<LayoutField, unknown>> | null;
}

/** A slot as the page shows it: the built-in with the account's changes. */
export interface LayoutTemplate {
  id: LayoutPresetId;
  fields: PresetFields;
  /** The account's own title and line, or null for the translated built-in ones. */
  title: string | null;
  text: string | null;
  /** The account changed the slot: "Reset to default" applies. */
  edited: boolean;
}

/** The allowed values of the choice settings that are not on/off; a new one needs its list here. */
const ENUMS: Partial<Record<LayoutChoiceField, readonly unknown[]>> = {
  printLayout: ['duplex', 'booklet'],
  printMode: ['stickers', 'copies'],
  stickerSpots: ['cover', 'sheet', 'a3', 'leaf'],
  paperStyle: ['empty', 'squared', 'dotted', 'lined'],
};
const isNotes = (v: unknown): v is ExtraNotes => typeof v === 'object' && v !== null && typeof (v as ExtraNotes).title === 'string';

/** Whether a stored value fits *key*: the built-in's type, an allowed enum value, free text as text. */
function fits(key: LayoutField, value: unknown, base: PresetFields): boolean {
  if (key === 'extraNotes') return value === null || isNotes(value);
  if (key === 'infoText') return typeof value === 'string';
  const allowed = ENUMS[key];
  return allowed ? allowed.includes(value) : typeof value === typeof base[key];
}

/** The stored settings over the built-in's, each only where it fits; settings saved before a newer field existed keep the built-in's value for it. */
function mergeFields(base: PresetFields, raw: Partial<Record<LayoutField, unknown>>): PresetFields {
  const out: Record<string, unknown> = { ...base };
  for (const key of LAYOUT_FIELDS) {
    const value = raw[key];
    if (value !== undefined && fits(key, value, base)) out[key] = value;
  }
  const merged = out as PresetFields;
  return { ...merged, extraPages: clampExtraPages(merged.extraPages) };
}

/** The four slots with the account's changes applied, in the built-in order. */
export function effectiveTemplates(stored: readonly StoredLayoutTemplate[]): LayoutTemplate[] {
  return LAYOUT_PRESETS.map((preset) => {
    const own = stored.find((s) => s.id === preset.id);
    return {
      id: preset.id,
      fields: own?.fields ? mergeFields(preset.fields, own.fields) : preset.fields,
      title: own?.title || null,
      text: own?.text || null,
      edited: !!own,
    };
  });
}

/** The stored list with *change* merged into slot *id* (null resets it); a slot left with nothing of its own is dropped, so it reads as the default again. */
export function withSlot(stored: readonly StoredLayoutTemplate[], id: LayoutPresetId, change: Omit<StoredLayoutTemplate, 'id'> | null): StoredLayoutTemplate[] {
  const rest = stored.filter((s) => s.id !== id);
  if (!change) return rest;
  const own: StoredLayoutTemplate = { ...stored.find((s) => s.id === id), ...change, id };
  return own.title || own.text || own.fields ? [...rest, own] : rest;
}

type PresetSource = Partial<Pick<ExamRecord, LayoutChoiceField | 'bookletOffsetMm'>>;

/** The choices as they print: sticker spots only matter with stickers, the fold strip only in a booklet. Free text is content and never decides the match. */
function printedForm(fields: PresetSource) {
  const print = printSettingsOf(fields);
  return {
    digitalGrading: print.digitalGrading,
    resultsQrBox: print.resultsQrBox,
    cutCorner: print.cutCorner,
    foldStrip: print.layout === 'booklet' && print.foldStrip,
    nameLine: fields.nameLine === true,
    mcCorrectionHint: fields.mcCorrectionHint === true,
    layout: print.layout,
    pageCodes: print.pageCodes,
    mode: print.mode,
    stickerSpots: print.mode === 'stickers' ? print.stickerSpots : 'cover',
    paperStyle: print.paperStyle,
    extraPages: print.extraPages,
    dottedFields: print.dottedFields,
  };
}

/** The scan-aid switches of the Layout step (issue #272): corner markers (= grading in Examance), cut corner, page codes and, in a booklet, the fold strip. */
export type ScanAidFields = Pick<PresetFields, 'digitalGrading' | 'cutCorner' | 'pageCodes' | 'foldStrip' | 'printLayout'>;

/** Whether every scan aid that prints in this layout is on (the fold strip counts only for booklets). */
export function allScanAidsOn(fields: ScanAidFields): boolean {
  return fields.digitalGrading && fields.cutCorner && fields.pageCodes && (fields.printLayout !== 'booklet' || fields.foldStrip);
}

/** The first template the choices match as printed, or 'custom'. */
export function matchPreset(fields: PresetSource, templates: readonly { id: LayoutPresetId; fields: PresetFields }[] = LAYOUT_PRESETS): LayoutPresetId | 'custom' {
  const current = JSON.stringify(printedForm(fields));
  const hit = templates.find((p) => JSON.stringify(printedForm({ ...fields, ...p.fields })) === current);
  return hit?.id ?? 'custom';
}

/** The free text a template would replace although the exam already has its own (the page asks first, issue #279). */
export function replacedTexts(template: PresetFields, exam: Partial<Pick<ExamRecord, LayoutTextField>>): LayoutTextField[] {
  return LAYOUT_TEXT_FIELDS.filter((key) => {
    if (!(key in template)) return false;
    if (key === 'infoText') return !!exam.infoText?.trim() && (template.infoText ?? '') !== exam.infoText;
    return !!exam.extraNotes && extraNotesKey(template.extraNotes) !== extraNotesKey(exam.extraNotes);
  });
}

const QUIET = { silentError: true } as const;

/** The account's edited slots; throws, so the page never mistakes a failed load for the defaults being saved. */
export async function fetchLayoutTemplates(): Promise<StoredLayoutTemplate[]> {
  const body = await api.get<{ templates: StoredLayoutTemplate[] }>('/user/layout-templates', QUIET);
  return body.templates;
}

/** Stores the account's edited slots (all of them; an empty list resets every slot). */
export async function saveLayoutTemplates(templates: readonly StoredLayoutTemplate[]): Promise<StoredLayoutTemplate[]> {
  const body = await api.put<{ templates: StoredLayoutTemplate[] }>('/user/layout-templates', { templates }, QUIET);
  return body.templates;
}
