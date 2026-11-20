/** Ids of the Settings sections in the "Account" group, in page order. Admins hold no student data (issue #58), so they get no GDPR or hygiene section; the account-data export (GDPR Art. 15/20) and the deletion are there for every signed-in account. */
export type AccountSectionId = 'security' | 'gdpr' | 'hygiene' | 'account-data' | 'delete-account';

export function accountSections(isAdmin: boolean, isAuthenticated: boolean): AccountSectionId[] {
  return [
    ...(isAuthenticated ? (['security'] as const) : []),
    ...(isAdmin ? [] : (['gdpr', 'hygiene'] as const)),
    ...(isAuthenticated ? (['account-data', 'delete-account'] as const) : []),
  ];
}
