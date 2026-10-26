/** URL builders for cross-links (`CrossLink`), so deep-link parameters stay in one place. */

const q = encodeURIComponent;

export const examHref = (examId: string) => `/exam/${q(examId)}`;
export const scanHref = (examId: string) => `/exam/${q(examId)}/scan`;
export const statsHref = (examId: string) => `/exam/${q(examId)}/stats`;

/** Parameters are read by `routes/exam/[id]/grade/+page.svelte`. */
export function gradeHref(examId: string, opts: { submissionId?: string; exerciseId?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.submissionId) params.set("submissionId", opts.submissionId);
  if (opts.exerciseId) params.set("exerciseId", opts.exerciseId);
  const s = params.toString();
  return `/exam/${q(examId)}/grade${s ? `?${s}` : ""}`;
}

/** Opens the exercise's editor in the library (`routes/exercises/+page.svelte`). */
export const exerciseHref = (exerciseId: string) => `/exercises?edit=${q(exerciseId)}`;
export const exerciseGroupHref = (groupId: string) => `/exercises?group=${q(groupId)}`;

/** Read by `routes/exam/[id]/verify-item/+page.svelte`. */
export function verifyItemHref(examId: string, submissionId: string, exerciseId: string, queue: string): string {
  const params = new URLSearchParams({ submissionId, exerciseId, queue });
  return `/exam/${q(examId)}/verify-item?${params.toString()}`;
}
