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

  // Auto close if opened, or click #btnOpenEditor
  const editor = page.locator('.editor-modal-overlay:not(.hidden)');
  if (await editor.count() > 0) {
    // Already open
  } else {
    await page.click('#btnOpenEditor');
  }

  const overflowInfo = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    const overflowing = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > docW + 1 || rect.width > docW + 1 || el.scrollWidth > docW + 1) {
        overflowing.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          rectRight: rect.right,
          rectWidth: rect.width,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          html: el.outerHTML.slice(0, 100)
        });
      }
    }
    return { docW, scrollW, overflowing };
  });

  console.log(JSON.stringify(overflowInfo, null, 2));
  await browser.close();
})();
