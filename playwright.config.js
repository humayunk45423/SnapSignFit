// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'F:/Me & My Docs/1. Recent Projects/SnaSignFit extra files/SnapSignFit_Extra_Files/tests',
  testMatch: '**/*.spec.js',
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  outputDir: 'F:/Me & My Docs/1. Recent Projects/SnaSignFit extra files/SnapSignFit_Extra_Files/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'F:/Me & My Docs/1. Recent Projects/SnaSignFit extra files/SnapSignFit_Extra_Files/test-results.json' }]
  ],
  webServer: {
    command: 'node ./serve.cjs',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 10000
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] }
    }
  ]
});
