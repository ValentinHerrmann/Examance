import { describe, expect, it } from 'vitest';
import { buildGradesCsv, type CsvExportRow } from '#lib/analytics/csvExport';

const row = (studentName: string, totalScore: number | string = 12): CsvExportRow => ({
  studentPseudonymId: 'p1',
  fallbackCode: 'F1',
  studentName,
  totalScore,
  maxPoints: 20,
  percentage: -1.5,
  grade: '2',
  status: '',
});

const dataLine = (csv: Uint8Array) => new TextDecoder().decode(csv.slice(3)).split('\r\n')[1];

describe('buildGradesCsv', () => {
  it('turns text that could start a formula into plain text', () => {
    for (const name of ['=HYPERLINK("x")', '+1', '-Anna', '@SUM(A1)', '\tTab']) {
      const cells = dataLine(buildGradesCsv([row(name)])).split(',');
      expect(cells[2].startsWith(`"'`)).toBe(true);
    }
    expect(dataLine(buildGradesCsv([row('=HYPERLINK("x")')]))).toContain('"\'=HYPERLINK(""x"")"');
  });

  it('keeps numbers and ordinary names unchanged', () => {
    expect(dataLine(buildGradesCsv([row('Anna Müller')]))).toBe('"p1","F1","Anna Müller","12","20","-1.5","2",""');
  });
});
