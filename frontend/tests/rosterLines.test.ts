import { describe, expect, it } from 'vitest';
import { parseRosterLines } from '#lib/utils/rosterLines';

describe('parseRosterLines', () => {
  it('splits on tab, semicolon and comma by default and drops empty lines', () => {
    expect(parseRosterLines('Doe Jane;123\n\n  Roe\tJohn  \nPoe,4')).toEqual([['Doe Jane', '123'], ['Roe', 'John'], ['Poe', '4']]);
  });

  it('keeps "Lastname, Firstname" whole when commas are not separators', () => {
    expect(parseRosterLines('Doe, Jane; 42\nRoe, John', /[\t;]/)).toEqual([['Doe, Jane', '42'], ['Roe, John']]);
  });
});
