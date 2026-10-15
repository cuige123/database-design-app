const { defineConfig } = require('@playwright/test');

const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
    browserName: 'chromium',
    launchOptions: { executablePath: edgePath },
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});