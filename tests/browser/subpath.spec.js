const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 验证 GitHub Pages 项目站点这类“子路径部署”场景：
// 所有资源都用相对路径引用，WASM 和 Service Worker 必须在 /sub/ 下正常工作。
const PORT = 4181;
const ROOT = path.resolve(__dirname, '../..');
const TEMP_ROOT = path.join(os.tmpdir(), `querypad-subpath-${process.pid}`);
const SUB_DIR = path.join(TEMP_ROOT, 'sub');
const STATIC_FILES = ['index.html', 'manifest.json', 'sw.js', 'ai-config.js', 'ai-assistant.js', 'assistant.css', 'brand-logo.jpg', 'er-editor.js', 'concept-er-editor.js', 'er-recognizer.js', 'fallback.js', 'offline-engine.js', 'self-test.js', 'sqlite-engine.js'];
const VENDOR_FILES = ['sql-wasm.js', 'sql-wasm.wasm', 'LICENSE'];
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.jpg': 'image/jpeg' };

let server;

function stage() {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(SUB_DIR, 'vendor', 'sql.js'), { recursive: true });
  STATIC_FILES.forEach(name => fs.copyFileSync(path.join(ROOT, name), path.join(SUB_DIR, name)));
  VENDOR_FILES.forEach(name => fs.copyFileSync(path.join(ROOT, 'vendor', 'sql.js', name), path.join(SUB_DIR, 'vendor', 'sql.js', name)));
}

test.beforeAll(async () => {
  stage();
  server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    // 与 GitHub Pages 等静态托管一致：目录请求返回该目录下的 index.html
    const filePath = urlPath.endsWith('/') ? path.join(TEMP_ROOT, urlPath, 'index.html') : path.join(TEMP_ROOT, urlPath);
    if (!filePath.startsWith(TEMP_ROOT)) { response.writeHead(403).end(); return; }
    fs.readFile(filePath, (error, data) => {
      if (error) { response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      response.end(data);
    });
  });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

test('子路径部署时资源、WASM 和 Service Worker 均可用', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requested = [];
  page.on('request', request => requested.push(request.url()));

  await page.goto(`http://127.0.0.1:${PORT}/sub/index.html`);
  await expect(page.locator('#runBtn')).toBeEnabled();
  await expect(page.locator('#engineMessage')).toContainText('已就绪');

  await page.locator('#sqlEditor').fill('SELECT COUNT(*) AS total FROM students;');
  await page.locator('#runBtn').click();
  await expect(page.locator('#resultTable tbody')).toContainText('120');

  const selfTest = await page.evaluate(() => {
    const result = window.queryPadSelfTest();
    return { passed: result.passed, failed: result.failed };
  });
  expect(selfTest.failed).toBe(0);

  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope || ''))
    .toBe(`http://127.0.0.1:${PORT}/sub/`);

  const wasmRequest = requested.find(url => url.endsWith('sql-wasm.wasm'));
  expect(wasmRequest).toBe(`http://127.0.0.1:${PORT}/sub/vendor/sql.js/sql-wasm.wasm`);
  expect(errors).toEqual([]);
});
