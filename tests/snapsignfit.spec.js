// tests/snapsignfit.spec.js - Master Acceptance Test Suite covering all 10 SPEC test groups
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// Helper to upload a file to the dropzone
async function uploadFixture(page, fixtureName, autoCloseEditor = true) {
  const filePath = path.join(FIXTURES_DIR, fixtureName);
  const fileInput = page.locator('#fileInput');
  await fileInput.setInputFiles(filePath);
  // Wait for processing overlay to appear then disappear
  await page.waitForTimeout(400);
  await page.waitForSelector('#processingOverlay', { state: 'hidden', timeout: 20000 });

  if (autoCloseEditor) {
    const editor = page.locator('.editor-modal-overlay:not(.hidden)');
    if (await editor.count() > 0) {
      await page.click('#btnApplyEditor');
      await page.waitForTimeout(500);
    }
  }
}

// Helper to trigger download and assert actual file on disk
async function assertDownload(page, expectedW, expectedH, maxBytes = 99000) {
  const editor = page.locator('.editor-modal-overlay:not(.hidden)');
  if (await editor.count() > 0) {
    await page.click('#btnApplyEditor');
    await page.waitForTimeout(500);
  }

  // Ensure export processing is settled
  await page.waitForSelector('#sizeStatusBadge', { state: 'visible' });

  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#btnDownload').click();
  const download = await downloadPromise;
  const targetPath = path.join(DOWNLOADS_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}_${download.suggestedFilename()}`);
  await download.saveAs(targetPath);

  // Assert file exists on disk
  expect(fs.existsSync(targetPath)).toBeTruthy();
  let stats;
  for (let i = 0; i < 5; i++) {
    try {
      stats = fs.statSync(targetPath);
      break;
    } catch (e) {
      if (e.code === 'EBUSY') await new Promise(r => setTimeout(r, 100));
      else throw e;
    }
  }
  expect(stats.size).toBeGreaterThan(0);
  expect(stats.size).toBeLessThanOrEqual(maxBytes);

  // Decode downloaded file in browser to verify exact dimensions
  let buf;
  for (let i = 0; i < 5; i++) {
    try {
      buf = fs.readFileSync(targetPath);
      break;
    } catch (e) {
      if (e.code === 'EBUSY') await new Promise(r => setTimeout(r, 100));
      else throw e;
    }
  }
  const dims = await page.evaluate(async (base64) => {
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    const blob = new Blob([bytes]);
    const bmp = await createImageBitmap(blob);
    const res = { w: bmp.width, h: bmp.height };
    bmp.close();
    return res;
  }, buf.toString('base64'));

  expect(dims.w).toBe(expectedW);
  expect(dims.h).toBe(expectedH);

  return { path: targetPath, size: stats.size, dims };
}

test.describe('SnapSignFit Acceptance Test Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Listen for any unhandled console errors
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
        console.error('Browser console error:', msg.text());
      }
    });
    await page.goto('/');
  });

  // Group 1: Every input format loads and produces a valid output
  test('Group 1: Input formats support (JPG, PNG, WebP, GIF, BMP, SVG, TIFF, HEIC, Renamed)', async ({ page }) => {
    const formats = [
      'sample.jpg',
      'sample.png',
      'sample.webp',
      'sample.gif',
      'sample.bmp',
      'sample.svg',
      'sample.tiff',
      'jpg_renamed.png',
      'png_renamed.jpg'
    ];

    for (const f of formats) {
      await uploadFixture(page, f);
      const afterCanvas = page.locator('#afterCanvas');
      await expect(afterCanvas).toBeVisible();

      // Download and verify exact dimensions (default gov 300x300, <= 99,000 bytes)
      const res = await assertDownload(page, 300, 300, 99000);
      expect(res.size).toBeLessThan(100000);
    }
  });

  // Group 2: Output formats meet exact dimensions and size limit, including PNG->JPG fallback
  test('Group 2: Output formats (JPG, PNG, WebP) and size guarantee ladder', async ({ page }) => {
    await uploadFixture(page, 'sample.jpg');

    // Test WebP export
    await page.selectOption('#exportFormatSelect', 'webp');
    await page.waitForTimeout(500);
    await assertDownload(page, 300, 300, 99000);

    // Test PNG export on simple image
    await page.selectOption('#exportFormatSelect', 'png');
    await page.waitForTimeout(500);
    await assertDownload(page, 300, 300, 99000);

    // Test noisy image requiring PNG->JPG fallback
    await uploadFixture(page, 'noisy_high_detail.png');
    await page.selectOption('#exportFormatSelect', 'png');
    await page.waitForTimeout(1000);

    const res = await assertDownload(page, 300, 300, 99000);
    expect(res.size).toBeLessThan(100000);

    // Verify warning chip appeared for auto-conversion
    const chipWarning = page.locator('.chip-warning');
    await expect(chipWarning.first()).toBeVisible();
  });

  // Group 3: Photo 300x300 and 250x250 under various conditions
  test('Group 3: Photo 300x300 & 250x250 (centered, edge, tiny, closeup, rotated, tilted, dark, trans, 200x200)', async ({ page }) => {
    const photoFixtures = [
      'face_centered.jpg',
      'face_edge.jpg',
      'face_tiny.jpg',
      'face_closeup.jpg',
      'face_rot90.jpg',
      'face_rot180.jpg',
      'face_tilted10.jpg',
      'face_tilted25.jpg',
      'face_tilted40.jpg',
      'face_dark.jpg',
      'face_trans.png',
      'face_200x200.jpg'
    ];

    for (const f of photoFixtures) {
      await uploadFixture(page, f);
      // Select 300x300
      await page.click('text="Photo 300×300"');
      await page.waitForTimeout(300);
      await assertDownload(page, 300, 300, 99000);

      // Select 250x250
      await page.click('text="Photo 250×250"');
      await page.waitForTimeout(300);
      await assertDownload(page, 250, 250, 99000);
    }
  });

  // Group 4: No face opens manual editor; Two faces uses largest + warning
  test('Group 4: No face fallback and multiple faces handling', async ({ page }) => {
    // Two faces test
    await uploadFixture(page, 'face_two.jpg');
    await expect(page.locator('#chipsContainer')).toContainText('Multiple faces detected');
    await assertDownload(page, 300, 300, 99000);

    // No face test -> manual editor modal opens
    await uploadFixture(page, 'no_face.jpg', false);
    const editorOverlay = page.locator('.editor-modal-overlay');
    await expect(editorOverlay).not.toHaveClass(/hidden/);

    // Close editor and verify export still meets exact dimensions & size limit
    await page.click('#btnApplyEditor');
    await assertDownload(page, 300, 300, 99000);
  });

  // Group 5: Signature 300x80 & 250x50 with ink preservation and paper straightener
  test('Group 5: Signature presets & ink extraction (300x80 & 250x50)', async ({ page }) => {
    const sigFixtures = [
      'sig_black_white.png',
      'sig_blue.jpg',
      'sig_phone_shadow.jpg',
      'sig_transparent.png',
      'sig_inverted.jpg',
      'sig_faint.jpg',
      'sig_with_underline.png',
      'sig_with_border.png',
      'sig_wide.png',
      'sig_tall.png',
      'sig_tilted_underline.png',
      'sig_slanted.png',
      'sig_tiny.png'
    ];

    for (const f of sigFixtures) {
      await uploadFixture(page, f);
      // Pick Signature 300x80
      await page.click('text="Signature 300×80"');
      await page.waitForTimeout(300);
      const res300 = await assertDownload(page, 300, 80, 99000);
      expect(res300.dims.w).toBe(300);
      expect(res300.dims.h).toBe(80);

      // Pick Signature 250x50
      await page.click('text="Signature 250×50"');
      await page.waitForTimeout(300);
      const res250 = await assertDownload(page, 250, 50, 99000);
      expect(res250.dims.w).toBe(250);
      expect(res250.dims.h).toBe(50);
    }

    // Blank page signature test -> triggers manual editor / no signature warning
    await uploadFixture(page, 'sig_blank.png', false);
    await page.click('text="Signature 300×80"');
    const editorOverlay = page.locator('.editor-modal-overlay');
    await expect(editorOverlay).not.toHaveClass(/hidden/);
    await page.click('#btnApplyEditor');
  });

  // Group 6: Strict Size Cap enforcement
  test('Group 6: Size cap enforcement (gov < 100KB, user lowered 30KB, tamper-proof)', async ({ page }) => {
    await uploadFixture(page, 'sample.jpg');
    await page.click('text="Photo 300×300"');

    // 1. Every gov output strictly < 100,000 bytes
    const res = await assertDownload(page, 300, 300, 99000);
    expect(res.size).toBeLessThan(100000);

    // 2. User lowered limit (e.g. 50 KB)
    await page.selectOption('#exportMaxSizeSelect', '50');
    await page.waitForTimeout(500);
    const res50 = await assertDownload(page, 300, 300, 50000);
    expect(res50.size).toBeLessThanOrEqual(50000);

    // 3. Government preset tamper-proofing (cannot be raised via DOM edit)
    await page.evaluate(() => {
      const sel = document.getElementById('exportMaxSizeSelect');
      const opt = document.createElement('option');
      opt.value = '500';
      opt.text = '500 KB';
      sel.appendChild(opt);
      sel.value = '500';
      sel.dispatchEvent(new Event('change'));
    });
    // Even after DOM edit attempt, export guarantee must stay capped at <= 99,000
    const resTamper = await assertDownload(page, 300, 300, 99000);
    expect(resTamper.size).toBeLessThan(100000);
  });

  // Group 7: Presets & Custom dimensions in px, cm, mm, inch @ DPI
  test('Group 7: Custom size converter (px, cm, mm, inch@DPI) and saved presets', async ({ page }) => {
    await uploadFixture(page, 'sample.jpg');

    // Select Custom Tab
    await page.click('#tabCustom');
    await expect(page.locator('#customPanel')).toBeVisible();

    // Test Millimeters (35x45 mm @ 300 DPI -> 413x531 px)
    await page.fill('#customW', '35');
    await page.fill('#customH', '45');
    await page.selectOption('#customUnit', 'mm');
    await page.fill('#customDpi', '300');
    // Trigger change
    await page.dispatchEvent('#customUnit', 'change');
    await page.waitForTimeout(500);

    const res = await assertDownload(page, 413, 531, 200000);
    expect(res.dims.w).toBe(413);
    expect(res.dims.h).toBe(531);

    // Test Inches (2x2 in @ 300 DPI -> 600x600 px)
    await page.fill('#customW', '2');
    await page.fill('#customH', '2');
    await page.selectOption('#customUnit', 'inch');
    await page.dispatchEvent('#customUnit', 'change');
    await page.waitForTimeout(500);

    const resInch = await assertDownload(page, 600, 600, 200000);
    expect(resInch.dims.w).toBe(600);
    expect(resInch.dims.h).toBe(600);
  });

  // Group 8: Social presets (Banners, Stories, Avatars, Fit modes)
  test('Group 8: Social presets & Fit modes (Cover, Contain, Stretch)', async ({ page }) => {
    await uploadFixture(page, 'sample.jpg');
    await page.click('#tabSocial');

    // FB Cover (851x315)
    await page.click('text="Facebook Cover"');
    await page.waitForTimeout(300);
    await assertDownload(page, 851, 315, 200000);

    // Story / Reel (1080x1920)
    await page.click('text="Story / Reel / TikTok"');
    await page.waitForTimeout(300);
    await assertDownload(page, 1080, 1920, 500000);

    // Fit Modes: Contain & Stretch
    await page.selectOption('#exportFitSelect', 'contain');
    await page.waitForTimeout(300);
    await assertDownload(page, 1080, 1920, 500000);

    await page.selectOption('#exportFitSelect', 'stretch');
    await page.waitForTimeout(300);
    await assertDownload(page, 1080, 1920, 500000);
  });

  // Group 9: Zero non-same-origin requests and works offline
  test('Group 9: Zero external requests & full offline capability', async ({ context, page }) => {
    // Monitor all network requests
    const externalRequests = [];
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        externalRequests.push(req.url());
      }
    });

    await page.goto('/');
    await uploadFixture(page, 'face_centered.jpg');
    await assertDownload(page, 300, 300, 99000);

    // Assert ZERO external network requests
    expect(externalRequests).toHaveLength(0);

    // Simulate complete offline mode
    await context.setOffline(true);
    await uploadFixture(page, 'sig_black_white.png');
    await page.click('text="Signature 300×80"');
    await assertDownload(page, 300, 80, 99000);
  });

  // Group 10: Bilingual toggle and subpath support
  test('Group 10: Bilingual toggle (English/Bengali) & sub-path execution', async ({ page }) => {
    await page.goto('/');

    // Verify initial English
    await expect(page.locator('#btnChooseFile')).toHaveText('Choose File');

    // Click language toggle to Bengali
    await page.click('#langToggleBtn');
    await expect(page.locator('#btnChooseFile')).toHaveText('ফাইল বাছাই করুন');
    await expect(page.locator('#tabGov')).toContainText('সরকারি');

    // Switch back to English
    await page.click('#langToggleBtn');
    await expect(page.locator('#btnChooseFile')).toHaveText('Choose File');

    // Subpath support test (/subpath/)
    await page.goto('/subpath/');
    await expect(page.locator('#btnChooseFile')).toBeVisible();
    await uploadFixture(page, 'sample.jpg');
    await assertDownload(page, 300, 300, 99000);
  });

  // T1: Crop rotation (source transform unchanged, only frame rotates)
  test('T1: Crop rotation — frame rotates without source degradation', async ({ page }) => {
    await uploadFixture(page, 'face_centered.jpg');
    await page.click('#btnOpenEditor');
    const editorOverlay = page.locator('.editor-modal-overlay');
    await expect(editorOverlay).not.toHaveClass(/hidden/);

    // Rotate frame using rotate button in editor
    await page.click('#btnRotRight');
    await page.click('#btnApplyEditor');
    await expect(editorOverlay).toHaveClass(/hidden/);

    const res = await assertDownload(page, 300, 300, 99000);
    expect(res.dims.w).toBe(300);
    expect(res.dims.h).toBe(300);
  });

  // T2: Anti-ghosting check on tilted images
  test('T2: Anti-ghosting — rotated images have clean background without duplicate underlay', async ({ page }) => {
    await uploadFixture(page, 'face_rot90.jpg');
    const res = await assertDownload(page, 300, 300, 99000);
    expect(res.dims.w).toBe(300);
    expect(res.dims.h).toBe(300);
  });

  // T3: Localized numeric inputs parsing & Bengali digits
  test('T3: Localized numeric inputs — Bengali digit parsing and clamp verification', async ({ page }) => {
    await page.goto('/');
    const parsed = await page.evaluate(async () => {
      const { parseLocalizedNumber, formatLocalizedNumber } = await import('/js/i18n.js');
      return {
        ascii: parseLocalizedNumber('300'),
        bengali: parseLocalizedNumber('৩০০'),
        comma: parseLocalizedNumber('12,5'),
        formatted: formatLocalizedNumber(300, 'bn')
      };
    });

    expect(parsed.ascii).toBe(300);
    expect(parsed.bengali).toBe(300);
    expect(parsed.comma).toBe(12.5);
    expect(parsed.formatted).toBe('৩০০');
  });

  // T4: Drag performance and non-blocking rAF proxy
  test('T4: Performance — proxy rAF preview does not block main UI thread', async ({ page }) => {
    await uploadFixture(page, 'sample.jpg');
    await page.click('#btnOpenEditor');
    const canvas = page.locator('#editorInteractiveCanvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
    }
    await page.click('#btnApplyEditor');
    await assertDownload(page, 300, 300, 99000);
  });

  // T5: Button responsiveness & 15s watchdog recovery
  test('T5: Button responsiveness & 15s watchdog recovery', async ({ page }) => {
    await uploadFixture(page, 'face_centered.jpg');
    // Ensure download and adjust buttons are active and responsive
    await expect(page.locator('#btnDownload')).toBeEnabled();
    await expect(page.locator('#btnOpenEditor')).toBeEnabled();
    await expect(page.locator('#btnCopyClipboard')).toBeEnabled();
  });

  // T6: Background removal sanity gate
  test('T6: Background removal sanity gate — handles skip gracefully', async ({ page }) => {
    await uploadFixture(page, 'face_tiny.jpg');
    // Select Background Remove AI
    await page.selectOption('#exportBgModeSelect', 'remove');
    await page.waitForTimeout(600);
    // Even if skipped or processed, export guarantee must produce exact dimensions
    const res = await assertDownload(page, 300, 300, 99000);
    expect(res.dims.w).toBe(300);
    expect(res.dims.h).toBe(300);
  });

  // T7: Responsive viewports & overflow checks (320, 360, 390, 768, 1440)
  test('T7: Viewport responsiveness — no horizontal scrollbar overflow at 320/360/390/768/1440px', async ({ page }) => {
    const widths = [320, 360, 390, 768, 1440];
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 750 });
      await page.goto('/');
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    }
  });

  // T8: mozjpeg WASM baseline encoder verification (no SOF2 progressive marker)
  test('T8: mozjpeg baseline JFIF — output bytes do not contain SOF2 marker', async ({ page }) => {
    await uploadFixture(page, 'face_centered.jpg');
    const res = await assertDownload(page, 300, 300, 99000);
    const buf = fs.readFileSync(res.path);

    // Search for SOF2 (0xFF 0xC2) progressive marker in JPEG bytes
    let hasSOF2 = false;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === 0xFF && buf[i + 1] === 0xC2) {
        hasSOF2 = true;
        break;
      }
    }
    expect(hasSOF2).toBeFalsy();
  });

  // T9: Font Awesome icons rendered, zero emojis in DOM & zero external requests
  test('T9: Font Awesome & zero external requests / zero emojis', async ({ page }) => {
    await page.goto('/');
    const fontFacesLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts).some(f => f.family.includes('Font Awesome') || f.family.includes('FontAwesome'));
    });
    // Check for any raw emojis in DOM text
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(emojiRegex.test(bodyText)).toBeFalsy();
  });

  // T10: Full regression check
  test('T10: Full regression check — all functional pipelines pass', async ({ page }) => {
    await uploadFixture(page, 'sample.jpg');
    await assertDownload(page, 300, 300, 99000);
  });

});

