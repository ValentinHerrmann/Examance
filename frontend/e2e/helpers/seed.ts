/**
 * Shared setup for the device-matrix specs (layout, a11y, screens): one vault
 * with one exercise and one exam, plus the list of routes worth checking.
 */
import type { Page } from '@playwright/test';
import { createExam, createExercise, createVault, currentExamId, exerciseBody } from './flows';
import { gotoDashboard, gotoExerciseLibrary, settleNavigation } from './nav';

export type Theme = 'light' | 'dark';
export const THEMES: Theme[] = ['light', 'dark'];

/** Pin the colour scheme before the first paint of every navigation. */
export async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem('bg_theme', value);
    } catch {
      /* storage unavailable: the test will fail on the data-theme check */
    }
  }, theme);
}

/** Create the vault, an exercise and an exam; returns the exam id. */
export async function seedWorkspace(page: Page): Promise<string> {
  await createVault(page);
  await gotoExerciseLibrary(page);
  await createExercise(page, { name: 'Layout exercise', topic: 'Layout', latex: exerciseBody('layout', 3) });
  await gotoDashboard(page);
  await createExam(page, { title: 'Layout exam', exercises: ['Layout exercise'] });
  return currentExamId(page);
}

export interface RouteSpec {
  name: string;
  path: string;
  /** Pages whose content is a workspace (fluid width). */
  workspace?: boolean;
}

export function mainRoutes(examId: string): RouteSpec[] {
  return [
    { name: 'dashboard', path: '/' },
    { name: 'exercises', path: '/exercises' },
    { name: 'analytics', path: '/analytics' },
    { name: 'settings', path: '/settings' },
    { name: 'settings-security', path: '/settings/security' },
    { name: 'help', path: '/help' },
    { name: 'impressum', path: '/legal/impressum' },
    { name: 'exam-new', path: '/exam/new' },
    { name: 'exam-setup', path: `/exam/${examId}`, workspace: true },
    { name: 'exam-scan', path: `/exam/${examId}/scan`, workspace: true },
    { name: 'exam-verify', path: `/exam/${examId}/verify`, workspace: true },
    { name: 'exam-grade', path: `/exam/${examId}/grade` },
    { name: 'exam-manual', path: `/exam/${examId}/manual`, workspace: true },
    { name: 'exam-stats', path: `/exam/${examId}/stats`, workspace: true },
  ];
}

/** Load a route and wait until the page has rendered its content and stopped navigating. */
export async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settleNavigation(page, 400);
  await page.locator('h1, h2').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => undefined);
  // Layout (fonts, charts, async data) settles shortly after first render.
  await page.waitForTimeout(500);
}
