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
    const main = document.querySelector('.main-content');
    const presets = document.querySelector('.presets-section');
    const csMain = window.getComputedStyle(main);
    const csPresets = window.getComputedStyle(presets);
    const body = document.body;
    const csBody = window.getComputedStyle(body);
    const html = document.documentElement;
    const csHtml = window.getComputedStyle(html);

    return {
      docClientW: html.clientWidth,
      docScrollW: html.scrollWidth,
      bodyScrollW: body.scrollWidth,
      main: {
        width: csMain.width,
        paddingLeft: csMain.paddingLeft,
        paddingRight: csMain.paddingRight,
        marginLeft: csMain.marginLeft,
        marginRight: csMain.marginRight,
        boxSizing: csMain.boxSizing,
        rect: main.getBoundingClientRect()
      },
      presets: {
        width: csPresets.width,
        rect: presets.getBoundingClientRect()
      }
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
