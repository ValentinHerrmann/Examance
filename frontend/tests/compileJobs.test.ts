import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '../src/lib/api/client';
import { compileLatex } from '../src/lib/latex/compiler';
import { LatexCompileError } from '../src/lib/latex/compileError';

describe('server compile jobs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'post').mockResolvedValue({ job_id: 'job-1' } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts a job and polls until the PDF arrives', async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]).buffer;
    const poll = vi.spyOn(api, 'pollBinary').mockResolvedValueOnce(undefined).mockResolvedValueOnce(pdf);
    const done = compileLatex('\\documentclass{article}', false, undefined, false);
    await vi.runAllTimersAsync();
    const result = await done;
    expect(api.post).toHaveBeenCalledWith('/compile/latex/jobs', expect.objectContaining({ latex: '\\documentclass{article}' }), { silentError: true });
    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[0][0]).toBe('/compile/latex/jobs/job-1');
    expect(Array.from(result.pdfBytes)).toEqual([37, 80, 68, 70]);
    expect(result.engineUsed).toBe('server');
  });

  it('sends aux seeds and reads the PDF and aux files of a JSON answer (issue #341)', async () => {
    const body = JSON.stringify({ pdf_b64: btoa('%PDF-1.7'), aux: { 'main.aux': btoa('\\relax') } });
    vi.spyOn(api, 'pollBinary').mockResolvedValueOnce(new TextEncoder().encode(body).buffer);
    const seed = { path: 'main.aux', content: new TextEncoder().encode('\\relax old') };
    const done = compileLatex('\\documentclass{article}', false, undefined, false, { seedAux: [seed] });
    await vi.runAllTimersAsync();
    const result = await done;
    expect(api.post).toHaveBeenCalledWith('/compile/latex/jobs', expect.objectContaining({ return_aux: true, seed_aux: { 'main.aux': btoa('\\relax old') } }), { silentError: true });
    expect(new TextDecoder().decode(result.pdfBytes)).toBe('%PDF-1.7');
    expect(result.aux?.map((f) => [f.path, new TextDecoder().decode(f.content)])).toEqual([['main.aux', '\\relax']]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('turns a failed job into a LatexCompileError with the TeX log', async () => {
    const failed = new ApiError(422, 'ERR_COMPILE_FAILED', '! Boom', null, { detail: '! Boom', log: 'full log' });
    vi.spyOn(api, 'pollBinary').mockRejectedValue(failed);
    const done = compileLatex('\\documentclass{article}', false, undefined, false).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await done;
    expect(err).toBeInstanceOf(LatexCompileError);
    expect(err.log).toBe('full log');
  });

  it('says the server restarted when the job is gone', async () => {
    vi.spyOn(api, 'pollBinary').mockRejectedValue(new ApiError(404, 'ERR_COMPILE_JOB_UNKNOWN', 'gone'));
    const done = compileLatex('\\documentclass{article}', false, undefined, false).catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await done).message).toMatch(/restart|neu gestartet/);
  });
});
