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

  const children = await page.evaluate(() => {
    const ps = document.querySelector('.presets-section');
    return Array.from(ps.children).map(c => ({
      tag: c.tagName,
      className: c.className,
      scrollWidth: c.scrollWidth,
      offsetWidth: c.offsetWidth
    }));
  });

  console.log(JSON.stringify(children, null, 2));
  await browser.close();
})();
