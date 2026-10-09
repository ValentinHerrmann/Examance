/**
 * Format concatenated grade (school year) and course/klasse letter.
 * e.g. grade="10", klasse="a" -> "10a"
 */
export function formatExamCourse(grade?: string | null, klasse?: string | null): string {
  const g = (grade || '').trim();
  const k = (klasse || '').trim();
  if (g && k) {
    if (k.toLowerCase().startsWith(g.toLowerCase())) {
      return k;
    }
    return `${g}${k}`;
  }
  return g || k || '';
}

/** Distinct exercise topics as exam-topic suggestions; "_General" is the editor's default, not a topic. */
export function exerciseTopicSuggestions(exercises: { topicTag?: string | null }[]): string[] {
  const topics = exercises.map((e) => e.topicTag?.trim()).filter((t): t is string => !!t && t !== '_General');
  return [...new Set(topics)].sort();
}

/**
 * Parse a combined date/duration string into separate datumDate and dauer parts.
 * e.g. "20.05.2025 (30 Min)" -> { datumDate: "20.05.2025", dauer: "30 Min" }
 * e.g. "20.05.2025" -> { datumDate: "20.05.2025", dauer: "" }
 */
export function parseDatumAndDauer(raw?: string | null): { datumDate: string; dauer: string } {
  if (!raw) return { datumDate: '', dauer: '' };
  const str = raw.trim();
  const match = str.match(/^(.*?)(?:\s*\((.*?)\))?$/);
  if (match && match[2] !== undefined) {
    return {
      datumDate: match[1].trim(),
      dauer: match[2].trim(),
    };
  }
  return { datumDate: str, dauer: '' };
}

/**
 * Format separate datumDate and dauer into a single combined string.
 * e.g. ("20.05.2025", "30 Min") -> "20.05.2025 (30 Min)"
 */
export function formatDatumAndDauer(datumDate?: string | null, dauer?: string | null): string {
  const dDate = (datumDate || '').trim();
  const dDauer = (dauer || '').trim();
  if (dDate && dDauer) {
    return `${dDate} (${dDauer})`;
  }
  if (dDauer) {
    return `(${dDauer})`;
  }
  return dDate;
}

