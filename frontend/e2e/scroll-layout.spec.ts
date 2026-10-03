import { appendFileSync } from 'node:fs';
import { test } from './helpers/guards';
import { lockApp } from './helpers/nav';
import { mainRoutes, seedWorkspace, visit } from './helpers/seed';

test('probe vertical overflow', async ({ page }) => {
  const examId = await seedWorkspace(page);
  const out: string[] = [];
  const probe = () => page.evaluate(() => {
    const m = document.querySelector('.app-main') as HTMLElement | null;
    return m ? { over: m.scrollHeight - m.clientHeight, vh: innerHeight } : null;
  });
  for (const r of [...mainRoutes(examId), { path: '/legal/datenschutz' }, { path: '/forgot-password' }]) {
    await visit(page, r.path);
    await page.waitForTimeout(400);
    const m = await probe();
    out.push(`${r.path.replace(examId, ':id')} over=${m?.over}`);
  }
  await lockApp(page);
  await page.waitForTimeout(600);
  out.push(`UNLOCK over=${(await probe())?.over}`);
  appendFileSync(process.env.PROBE_OUT!, test.info().project.name + '\n' + out.join('\n') + '\n');
});
