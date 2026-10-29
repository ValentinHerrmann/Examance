/** Layout problem reports (issue #134): teachers send them, admins review them. The content is plaintext the teacher chose to share; every call is `silentError`, callers report inline. */

import { uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import { api } from './client';

export type LayoutReportKind = 'exam' | 'exercise';

export interface LayoutReportFileData {
  filename: string;
  mimeType: string;
  content: Uint8Array;
}

export interface LayoutReportInput {
  kind: LayoutReportKind;
  title: string;
  engine: 'browser' | 'server';
  appVersion: string;
  problem: string;
  expected: string;
  compileError: string | null;
  /** Optional consent to an anonymized public GitHub issue; independent of sending. */
  allowPublication: boolean;
  files: LayoutReportFileData[];
}

export async function submitLayoutReport(input: LayoutReportInput): Promise<void> {
  await api.post<void>(
    '/layout-reports',
    {
      source_kind: input.kind,
      source_title: input.title.slice(0, 255),
      engine: input.engine,
      app_version: input.appVersion.slice(0, 64),
      problem: input.problem,
      expected: input.expected,
      compile_error: input.compileError ? input.compileError.slice(0, 20000) : null,
      allow_publication: input.allowPublication,
      files: input.files.map((f) => ({
        filename: f.filename,
        mime_type: f.mimeType,
        content_b64: uint8ArrayToBase64(f.content),
      })),
    },
    { silentError: true },
  );
}

export interface LayoutReportSummary {
  id: string;
  reporter_email: string;
  source_kind: LayoutReportKind;
  source_title: string;
  status: 'open' | 'done';
  allow_publication: boolean;
  problem: string;
  created_at: string;
  resolved_at: string | null;
}

export interface LayoutReportFileInfo {
  id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
}

export interface LayoutReportDetail extends LayoutReportSummary {
  engine: string;
  app_version: string;
  expected: string;
  compile_error: string | null;
  resolution_note: string | null;
  files: LayoutReportFileInfo[];
}

export interface LayoutReportPage {
  items: LayoutReportSummary[];
  total: number;
  open_count: number;
}

export function listLayoutReports(status: 'open' | 'done'): Promise<LayoutReportPage> {
  return api.get<LayoutReportPage>(`/admin/layout-reports?status=${status}&limit=200`, { silentError: true });
}

export function getLayoutReport(id: string): Promise<LayoutReportDetail> {
  return api.get<LayoutReportDetail>(`/admin/layout-reports/${id}`, { silentError: true });
}

export function getLayoutReportFile(reportId: string, fileId: string): Promise<ArrayBuffer> {
  return api.getBinary(`/admin/layout-reports/${reportId}/files/${fileId}`, { silentError: true });
}

/** The reporter is mailed (with *note* when given); resolving twice mails once. */
export function resolveLayoutReport(id: string, note: string): Promise<void> {
  return api.post<void>(`/admin/layout-reports/${id}/resolve`, { note: note.trim() || null }, { silentError: true });
}

export function deleteLayoutReport(id: string): Promise<void> {
  return api.delete<void>(`/admin/layout-reports/${id}`, { silentError: true });
}
