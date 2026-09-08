import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Isolated fixtures: no real credentials, backend writes, or personal data.
const out = mkdtempSync(join(tmpdir(), 'knowledge-base-design-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 5191, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const results = [];
const failures = [];
const date = new Date().toISOString().slice(0, 10);
const timestamp = `${date}T10:00:00Z`;
const routes = process.env.UI_ROUTES?.split(',') || ['/', '/sessions', '/paths', '/items', '/timeline', '/calendar', '/notes', '/notes/note-a', '/reports', '/imports', '/auth'];
function fixtures(state) {
  const long = state === 'long' ? ' ExtendedUnbrokenName'.repeat(18).replaceAll(' ', '') : '';
  const empty = state === 'empty';
  const paths = empty ? [] : [{ id: 'path-a', name: 'Distributed systems' + long, description: 'Replication, consistency, and resilient services.' + long, status: 'ACTIVE', color: '#2188FF' }, { id: 'path-b', name: 'Reading', description: 'Books and chapter notes.', status: 'ACTIVE', color: '#2E9D68' }];
  const items = empty ? [] : [{ id: 'item-a', title: 'Designing Data-Intensive Applications' + long, type: 'BOOK', status: 'ACTIVE', description: 'Read and annotate the replication chapter.' + long, source: 'Personal library', pathIds: ['path-a'], tags: ['distributed-systems'], progress: 40 }];
  const note = { id: 'note-a', title: 'Replication notes' + long, content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Compare leader-based replication with leaderless designs.' + long }] }] }), contentText: 'Compare leader-based replication with leaderless designs.' + long, tags: ['systems' + long], createdAt: timestamp, updatedAt: timestamp, version: 1 };
  const notes = empty ? [] : [note];
  const sessions = empty ? [] : [{ id: 'entry-a', pathId: 'path-a', itemId: 'item-a', itemIds: ['item-a'], description: 'Replication and consistency models' + long, source: 'WEB', startedAt: timestamp, endedAt: `${date}T11:00:00Z`, durationSeconds: 3600, running: false }];
  const labels = empty ? [] : [{ id: 'label-a', name: 'Study day' + long, color: '#2878D5' }];
  const assignments = labels.map(label => ({ ...label, labelId: label.id, portion: 1 }));
  const categories = paths.map((path, index) => ({ id: path.id, label: path.name, seconds: 3600 - index * 1800 }));
  const days = [{ date, totalSeconds: empty ? 0 : 5400, paths: categories, items: [], calendarNote: empty ? '' : 'Finished the chapter.' + long, calendarLabels: labels.map(label => ({ ...label, label: label.name, portion: 1 })) }];
  if (state === 'dense') {
    for (let index = 1; index < 60; index++) {
      paths.push({ ...paths[0], id: `path-${index}`, name: `Learning path ${index}` });
      items.push({ ...items[0], id: `item-${index}`, title: `Reference ${index}` });
      notes.push({ ...note, id: `note-${index}`, title: `Research notes ${index}` });
      sessions.push({ ...sessions[0], id: `entry-${index}`, description: `Reading session ${index}` });
    }
  }
  return { paths, items, note, notes, sessions, labels, assignments, categories, days };
}
async function check(page, label, screenshot = true) {
  // Visit virtualized rows so their remembered sizes settle before axe compares
  // foreground/background geometry. Keep content-visibility enabled throughout.
  const rows = page.locator('.session-card, .note-row, .path-list > article');
  if (await rows.count() > 50) {
    const position = await page.evaluate(() => scrollY);
    for (const row of await rows.all()) {
      await row.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await page.evaluate(y => scrollTo(0, y), position);
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  if (dimensions.scroll > dimensions.viewport) failures.push({ label, overflow: dimensions, elements: await page.evaluate(() => Array.from(document.querySelectorAll('main *')).filter(e => e.getBoundingClientRect().right > innerWidth).slice(0, 12).map(e => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width }))) });
  const errors = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = errors.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
  if (violations.length) failures.push({ label, violations });
  if (screenshot) await page.screenshot({ path: join(out, `${label}.png`), fullPage: true, animations: 'disabled' });
  results.push({ label, ...dimensions, violations: violations.length });
}
try {
  for (const mode of ['light', 'dark']) {
    for (const state of process.env.UI_STATES?.split(',') || ['populated', 'empty', 'long', 'dense', 'error']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: mode, reducedMotion: 'reduce' });
      context.setDefaultTimeout(15000);
      await context.addInitScript(() => {
        if (!sessionStorage.getItem('design-fixture-initialized')) {
          localStorage.setItem('know_token', 'isolated-design-fixture');
          sessionStorage.setItem('design-fixture-initialized', 'true');
        }
      });
      await context.route('https://accounts.google.com/**', route => route.abort());
      const f = fixtures(state);
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace('/api/v1', '');
        if (state === 'error' && !path.startsWith('/auth')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        let data = [];
        if (path === '/paths') data = f.paths;
        if (path === '/items') data = f.items;
        if (path === '/notes') data = url.search ? { items: f.notes, page: 0, size: 20, totalItems: f.notes.length, totalPages: 1 } : f.notes;
        if (path === '/notes/note-a') data = f.note;
        if (path === '/notes/labels') data = [{ id: 'label-a', name: 'systems' }];
        if (path === '/time-entries') data = url.search ? { sessions: f.sessions, page: 0, totalPages: 2, totalSessions: f.sessions.length } : f.sessions;
        if (path === '/timers/current') data = null;
        if (path === '/statistics') data = { todaySeconds: state === 'empty' ? 0 : 5400, weekSeconds: state === 'empty' ? 0 : 29700, monthSeconds: state === 'empty' ? 0 : 116100, weekByPath: state === 'empty' ? {} : { 'path-a': 18900 }, weekByItem: state === 'empty' ? {} : { 'item-a': 18900 }, completedItems: 12, activeItems: 7, recentProgressChanges: [] };
        if (path === '/activities') data = state === 'empty' ? [] : [{ id: 'activity-a', type: 'TIME_TRACKED', pathId: 'path-a', itemId: 'item-a', title: 'Replication and consistency models', detail: f.items[0].description, occurredAt: timestamp }];
        if (path === '/calendar/labels') data = f.labels;
        if (path === '/calendar/days') data = [{ date, note: state === 'empty' ? '' : 'Finished the chapter.', labels: f.assignments }];
        if (path === '/reports') data = { period: 'WEEK', from: date, to: date, totalSeconds: 5400, days: f.days, paths: f.categories, items: [], calendarLabels: f.labels.map(label => ({ ...label, label: label.name, days: 1, markers: 0 })) };
        if (path === '/imports/clockify/batches') data = state === 'empty' ? [] : [{ id: 'batch-a', imported: 8, skipped: 1, createdPaths: 2, source: 'CLOCKIFY', createdAt: timestamp }];
        if (path === '/paths/path-a/summary') data = { path: f.paths[0], itemIds: ['item-a'], itemProgress: { 'item-a': 40 }, trackedSeconds: 5400, recentActivity: [] };
        if (path === '/auth/config') data = { googleClientId: null };
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      page.on('pageerror', error => failures.push({ mode, state, error: error.message }));
      for (const path of routes) {
        if (path === '/auth') {
          await page.evaluate(() => localStorage.removeItem('know_token'));
          await page.goto('http://127.0.0.1:5191/');
          await page.locator('.auth').waitFor();
        } else await page.goto(`http://127.0.0.1:5191${path}`);
        await page.locator('main h1').waitFor();
        await page.waitForLoadState('networkidle');
        const widths = state === 'populated' || state === 'long' ? [1440, 1024, 390, 320, 2560] : [390];
        for (const width of widths) {
          await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
          await page.waitForFunction(() => Array.from(document.querySelectorAll('.echarts')).every(chart => !chart.querySelector('svg') || Math.abs(chart.querySelector('svg').getBoundingClientRect().width - chart.getBoundingClientRect().width) < 2));
          const label = `${mode}-${state}-${path === '/' ? 'overview' : path.slice(1).replaceAll('/', '-')}-${width}`;
          // Full axe audit at desktop and mobile; other sizes check geometry.
          if (width === 1440 || width === 390) await check(page, label);
          else {
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            if (overflow) {
              failures.push({ label, overflow, elements: await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > innerWidth || e.scrollWidth > e.clientWidth + 1).slice(0, 20).map(e => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width, scroll: e.scrollWidth }))) });
              await page.screenshot({ path: join(out, `${label}.png`), fullPage: true });
            }
          }
        }
        if (state === 'populated') {
          await page.setViewportSize({ width: 390, height: 844 });
          if (path === '/paths') {
            await page.getByRole('button', { name: 'History', exact: true }).first().click();
            await page.locator('.path-summary').waitFor();
            await check(page, `${mode}-path-history`);
            await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
            await check(page, `${mode}-path-edit`);
          }
          if (path === '/items') {
            await page.getByRole('button', { name: 'Edit/status/type', exact: true }).click();
            await page.getByRole('dialog').waitFor();
            await check(page, `${mode}-item-dialog`);
            await page.keyboard.press('Escape');
            assert(await page.getByRole('button', { name: 'Edit/status/type', exact: true }).evaluate(e => e === document.activeElement));
            await page.getByRole('button', { name: 'Update progress', exact: true }).click();
            await check(page, `${mode}-prompt-dialog`);
            await page.getByRole('button', { name: 'OK', exact: true }).focus();
            await page.keyboard.press('Tab');
            assert(await page.getByRole('dialog').locator('input').evaluate(e => e === document.activeElement));
            await page.keyboard.press('Escape');
          }
          if (path === '/sessions') {
            await page.getByRole('button', { name: 'Edit session', exact: true }).click();
            await check(page, `${mode}-session-edit`);
          }
          if (path === '/notes/note-a') {
            await page.getByRole('textbox', { name: 'Note content', exact: true }).waitFor();
            assert.match(await page.getByRole('textbox', { name: 'Note content', exact: true }).innerText(), /Compare leader-based/);
          }
          if (path === '/reports') {
            await page.locator('.dp__input').click();
            await check(page, `${mode}-date-picker`);
            await page.keyboard.press('Escape');
            await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
            await page.waitForFunction(() => getComputedStyle(document.querySelector('.v-table')).backgroundColor === getComputedStyle(document.querySelector('.dp__input')).backgroundColor);
            await check(page, `${mode}-reports-theme-switched`);
            await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
          }
          if (path === '/') {
            await page.locator('#timer-items').focus();
            await page.keyboard.press('ArrowDown');
            await page.getByRole('listbox').waitFor();
            await check(page, `${mode}-item-menu`);
            await page.keyboard.press('Escape');
          }
          if (path === '/auth') {
            await page.locator('.primary').hover();
            await check(page, `${mode}-control-hover`);
            await page.locator('body').click({ position: { x: 1, y: 1 } });
            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
            assert.equal(await page.locator(':focus-visible').count(), 1);
            await check(page, `${mode}-keyboard-focus`);
          }
        }
      }
      await context.close();
      console.log(`Reviewed ${mode} / ${state}`);
    }
  }
  // Saved preference beats the system default and survives reload/navigation.
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.route('https://accounts.google.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:5191/');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.keyboard.press('Tab');
  assert(await page.locator('.dashboard-skip').evaluate(e => e === document.activeElement));
  await page.keyboard.press('Enter');
  assert(await page.locator('main').evaluate(e => e === document.activeElement));
  await context.close();
} finally {
  writeFileSync(join(out, 'results.json'), JSON.stringify({ results, failures }, null, 2));
  console.log(`UI evidence: ${out}; ${results.length} audits, ${failures.length} failures`);
  await browser.close();
  await server.close();
}
assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
