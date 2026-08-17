import { describe, it, expect } from 'vitest';
import { isPublicPath, isUnlockPath, isGradeActivePath } from '../src/lib/stores/navigationStore';

describe('navigationStore public path helpers', () => {
  it('identifies public paths correctly without an unlocked session', () => {
    expect(isPublicPath('/unlock')).toBe(true);
    expect(isPublicPath('/legal/impressum')).toBe(true);
    expect(isPublicPath('/legal/datenschutz')).toBe(true);
    expect(isPublicPath('/reset-password')).toBe(true);
    expect(isPublicPath('/reset-password?token=abcdef')).toBe(true);
    expect(isPublicPath('/forgot-password')).toBe(true);
  });

  it('rejects protected paths', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/admin/users')).toBe(false);
    expect(isPublicPath('/exam/new')).toBe(false);
    expect(isPublicPath('/exercises')).toBe(false);
  });

  it('identifies unlock path correctly', () => {
    expect(isUnlockPath('/unlock')).toBe(true);
    expect(isUnlockPath('/unlock/something')).toBe(false);
    expect(isUnlockPath('/')).toBe(false);
  });

  it('identifies grade active path correctly', () => {
    expect(isGradeActivePath('/exam/123/grade')).toBe(true);
    expect(isGradeActivePath('/exam/123')).toBe(false);
  });
});
