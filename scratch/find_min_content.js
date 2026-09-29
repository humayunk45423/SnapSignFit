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

  const found = await page.evaluate(() => {
    const ws = document.querySelector('.workspace-section');
    const items = [];
    for (const el of ws.querySelectorAll('*')) {
      if (el.scrollWidth > 288 || el.offsetWidth > 288) {
        items.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          offsetWidth: el.offsetWidth,
          scrollWidth: el.scrollWidth,
          text: el.innerText ? el.innerText.slice(0, 50) : ''
        });
      }
    }
    return items;
  });

  console.log(JSON.stringify(found, null, 2));
  await browser.close();
})();
