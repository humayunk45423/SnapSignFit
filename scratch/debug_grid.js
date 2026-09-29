const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 320, height: 750 } });
  await page.goto('http://localhost:3000');

  const filePath = path.join(__dirname, '../tests/fixtures/sample.jpg');
  await page.locator('#fileInput').setInputFiles(filePath);
  await page.waitForTimeout(400);
  await page.waitForSelector('#processingOverlay', { state: 'hidden', timeout: 20000 });

  // Open editor
  const editor = page.locator('.editor-modal-overlay:not(.hidden)');
  if (await editor.count() === 0) {
    await page.click('#btnOpenEditor');
  }

  const debug = await page.evaluate(() => {
    const el = document.querySelector('.presets-section');
    const ws = document.querySelector('.workspace-section');
    const main = document.querySelector('.main-content');
    return {
      windowInnerWidth: window.innerWidth,
      docClientW: document.documentElement.clientWidth,
      docScrollW: document.documentElement.scrollWidth,
      wsStyle: {
        display: getComputedStyle(ws).display,
        gridTemplateColumns: getComputedStyle(ws).gridTemplateColumns,
        width: getComputedStyle(ws).width,
        rect: ws.getBoundingClientRect()
      },
      elStyle: {
        display: getComputedStyle(el).display,
        width: getComputedStyle(el).width,
        rect: el.getBoundingClientRect()
      }
    };
  });

  console.log(JSON.stringify(debug, null, 2));
  await browser.close();
})();
