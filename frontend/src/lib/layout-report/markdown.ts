/**
 * GitHub issue text for a layout report (issue #134). Never includes the reporter, the
 * exam/exercise title or resource file names: the admin pastes it into a public issue.
 */

import type { LayoutReportDetail } from "#lib/api/layoutReports";

export interface ReportTexFile {
  filename: string;
  source: string;
}

/** A fence longer than any backtick run in *text*, so pasted LaTeX can never close it early. */
function fence(text: string, lang = ""): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${lang}\n${text.replace(/\s+$/, "")}\n${ticks}`;
}

function firstLine(text: string, max = 80): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function layoutReportTitle(report: Pick<LayoutReportDetail, "problem">): string {
  return `Layout: ${firstLine(report.problem)}`;
}

export function layoutReportMarkdown(report: LayoutReportDetail, texFiles: ReportTexFile[]): string {
  const kind = report.source_kind === "exam" ? "exam" : "exercise";
  const hasPdf = report.files.some((f) => f.mime_type === "application/pdf");
  const parts = [
    "## Problem",
    report.problem.trim(),
    "## Expected result",
    report.expected.trim(),
    "## Context",
    [
      `- Source: ${kind}`,
      `- LaTeX engine: ${report.engine}`,
      `- App version: ${report.app_version || "unknown"}`,
      `- Reported: ${report.created_at.slice(0, 10)}`,
    ].join("\n"),
  ];
  if (report.compile_error) parts.push("## Compile error", fence(report.compile_error));
  for (const file of texFiles) {
    parts.push(
      `<details><summary>LaTeX source: ${file.filename}</summary>\n\n${fence(file.source, "latex")}\n\n</details>`
    );
  }
  if (hasPdf) parts.push("_Compiled PDF attached below._");
  return parts.join("\n\n");
}
