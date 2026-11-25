import { describe, expect, it } from 'vitest';
import { pdfInputs } from '../src/lib/latex/engine/pdfStep';

// Regression: xdvipdfmx ran with main.xdv only and failed with "Could not find file: ./examance-logo.pdf".
describe('pdfInputs', () => {
  it('hands xdvipdfmx the resources and assets XeTeX saw, plus the XDV', () => {
    const logo = new Uint8Array([1]);
    const asset = new Uint8Array([2]);
    const xdv = new Uint8Array([3]);
    const files = pdfInputs(new Map([['examance-logo.pdf', logo], ['img/logo_mtg.pdf', asset], ['main.tex', new Uint8Array()]]), xdv);
    expect(files.get('examance-logo.pdf')).toBe(logo);
    expect(files.get('img/logo_mtg.pdf')).toBe(asset);
    expect(files.get('main.xdv')).toBe(xdv);
  });
});
