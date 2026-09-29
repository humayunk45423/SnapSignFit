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

  const info = await page.evaluate(() => {
    const presets = document.querySelector('.presets-section');
    const widerThan288 = [];
    for (const el of presets.querySelectorAll('*')) {
      const w = el.getBoundingClientRect().width;
      if (w > 288) {
        widerThan288.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          width: w,
          html: el.outerHTML.slice(0, 100)
        });
      }
    }
    return {
      presetsParent: presets.parentElement.className,
      presetsParentWidth: presets.parentElement.getBoundingClientRect().width,
      widerThan288
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
