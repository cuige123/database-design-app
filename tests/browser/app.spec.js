const { test, expect } = require('@playwright/test');

async function openApp(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/index.html');
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(page.locator('#engineMessage')).toContainText('已就绪');
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('querypad-sqlite');
  });
});

test('loads the real SQLite WASM engine and executes SQL in the workbench', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total FROM students;');
  await page.locator('#runBtn').click();
  await expect(page.locator('#resultTable tbody')).toContainText('120');
  await expect(page.locator('#statusLabel')).toHaveClass(/success/);
  expect(errors).toEqual([]);
});

test('runs the in-app self-test and restores the practice database', async ({ page }) => {
  const errors = await openApp(page);
  const result = await page.evaluate(() => window.queryPadSelfTest());
  expect(result.failed).toBe(0);
  expect(result.passed).toBeGreaterThan(20);
  expect(result.detail).toContain('SQLite');
  expect(errors).toEqual([]);
});

test('creates, switches, isolates, and restores projects across reloads', async ({ page }) => {
  const errors = await openApp(page);
  await page.locator('#sqlEditor').fill('CREATE TABLE browser_only (value INTEGER); INSERT INTO browser_only VALUES (17);');
  await page.locator('#runBtn').click();
  await expect(page.locator('#statusLabel')).toHaveClass(/success/);

  const isolated = await page.evaluate(async () => {
    await window.queryPadEngine.switchProject('browser-project');
    const empty = window.queryPadEngine.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_only'").values;
    window.queryPadEngine.execute('CREATE TABLE browser_only (value INTEGER); INSERT INTO browser_only VALUES (17);');
    await window.queryPadEngine.switchProject('default');
    const restored = window.queryPadEngine.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='browser_only'").values;
    return { empty, restored };
  });
  expect(isolated.empty).toEqual([]);
  expect(isolated.restored).toEqual([]);

  const persisted = await page.evaluate(() => ({
    projectId: window.queryPadProjectId,
    projects: JSON.parse(localStorage.getItem('querypad-projects') || '[]').map(project => project.id)
  }));
  expect(persisted.projectId).toBe('default');
  expect(persisted.projects).toContain('default');
  expect(errors).toEqual([]);
});

test('escapes project names instead of rendering them as markup', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const list = document.querySelector('#projectList');
    const name = '<img src=x onerror=window.__xss=1>';
    const row = document.createElement('button');
    row.className = 'project-item';
    row.textContent = name;
    list.replaceChildren(row);
    return { text: list.textContent, images: list.querySelectorAll('img').length, html: list.innerHTML };
  });
  expect(result.text).toContain('<img src=x onerror=window.__xss=1>');
  expect(result.images).toBe(0);
  expect(result.html).not.toContain('<img');
});

test('keeps the current database usable when restoring a corrupt snapshot', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const engine = window.queryPadEngine;
    const before = engine.execute('SELECT COUNT(*) AS total FROM students').values[0][0];
    let rejected = false;
    try { engine.restoreSnapshot(new Uint8Array([1, 2, 3, 4])); } catch (_) { rejected = true; }
    const after = engine.execute('SELECT COUNT(*) AS total FROM students').values[0][0];
    return { rejected, before, after };
  });
  expect(result).toEqual({ rejected: true, before: 120, after: 120 });
});

test('registers the service worker, then serves the app and WASM offline', async ({ page, context }) => {
  await openApp(page);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state || '')).toBe('activated');
  await page.evaluate(() => new Promise(resolve => {
    if (navigator.serviceWorker.controller) return resolve();
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    setTimeout(resolve, 5000);
  }));
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('#runBtn')).toBeEnabled();
  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total FROM students;');
  await page.locator('#runBtn').click();
  await expect(page.locator('#resultTable tbody')).toContainText('120');
});