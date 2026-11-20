import { describe, expect, it } from 'vitest';
import { accountSections } from '../src/lib/settings/sections';

describe('Settings account sections', () => {
  it('offers the account-data export and deletion to teachers and admins', () => {
    expect(accountSections(false, true)).toEqual(['security', 'gdpr', 'hygiene', 'account-data', 'delete-account']);
    expect(accountSections(true, true)).toEqual(['security', 'account-data', 'delete-account']);
  });

  it('shows no account sections that need a session when signed out', () => {
    expect(accountSections(false, false)).toEqual(['gdpr', 'hygiene']);
  });
});
