import { appendFileSync } from 'node:fs';
import { test } from './helpers/guards';
import { lockApp } from './helpers/nav';
import { mainRoutes, seedWorkspace, visit } from './helpers/seed';

test('probe vertical overflow', async ({ page }) => {
  const examId = await seedWorkspace(page);
  const out: string[] = [];
  const probe = () =>
    page.evaluate(() => {
      const m = document.querySelector('.app-main') as HTMLElement | null;
      if (!m) return null;
      const over = m.scrollHeight - m.clientHeight;
      const kids = [...m.children].map((c) => `${c.tagName.toLowerCase()}.${(c.className || '').toString().slice(0, 40)}:${Math.round(c.getBoundingClientRect().height)}`);
      return { over, kids: kids.join(' | '), vh: innerHeight };
    });
  for (const r of mainRoutes(examId)) {
    await visit(page, r.path);
    await page.waitForTimeout(400);
    const m = await probe();
    if (m && m.over > 0) out.push(`${r.path} vh=${m.vh} over=${m.over} ${m.kids}`);
  }
  await lockApp(page);
  await page.waitForTimeout(600);
  const u = await probe();
  out.push(`UNLOCK vh=${u?.vh} over=${u?.over} ${u?.kids}`);
  appendFileSync(process.env.PROBE_OUT!, test.info().project.name + '\n' + out.join('\n') + '\n');
});
