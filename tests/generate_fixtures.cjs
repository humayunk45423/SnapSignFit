// tests/generate_fixtures.cjs - Programmatically generate comprehensive image fixtures
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const UTIF = require('utif');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

async function generateAllFixtures() {
  console.log('Launching browser to generate fixtures...');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Helper inside page to get dataURL
  await page.setContent('<html><body><canvas id="c"></canvas></body></html>');

  async function renderCanvasToBuffer(w, h, drawCode, type = 'image/png', quality = 0.95) {
    return await page.evaluate(async ({ w, h, drawCode, type, quality }) => {
      const c = document.getElementById('c');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      // Execute custom draw code
      const fn = new Function('ctx', 'w', 'h', drawCode);
      fn(ctx, w, h);

      return new Promise((resolve) => {
        c.toBlob((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        }, type, quality);
      });
    }, { w, h, drawCode, type, quality });
  }

  function saveBase64(dataUrl, filepath) {
    const base64 = dataUrl.split(',')[1];
    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
    console.log(`Saved: ${path.basename(filepath)} (${fs.statSync(filepath).size} bytes)`);
  }

  // --- 1. Basic formats ---
  console.log('\n--- Generating format variations ---');
  
  // Standard face drawing helper
  const drawFace = (ctx, w, h, { cx = w/2, cy = h/2, r = Math.min(w,h)*0.25, tilt = 0, bg = '#f1f5f9' } = {}) => {
    ctx.save();
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.translate(cx, cy);
    if (tilt) ctx.rotate((tilt * Math.PI) / 180);

    // Head / Face oval
    ctx.fillStyle = '#fcd34d';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes
    const eyeOffsetX = r * 0.32;
    const eyeOffsetY = -r * 0.18;
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-eyeOffsetX, eyeOffsetY, r * 0.10, 0, Math.PI * 2);
    ctx.arc(eyeOffsetX, eyeOffsetY, r * 0.10, 0, Math.PI * 2);
    ctx.fill();

    // Eyebrows
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-eyeOffsetX - 10, eyeOffsetY - 12);
    ctx.lineTo(-eyeOffsetX + 10, eyeOffsetY - 12);
    ctx.moveTo(eyeOffsetX - 10, eyeOffsetY - 12);
    ctx.lineTo(eyeOffsetX + 10, eyeOffsetY - 12);
    ctx.stroke();

    // Nose
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.05);
    ctx.lineTo(r * 0.08, r * 0.15);
    ctx.lineTo(-r * 0.05, r * 0.18);
    ctx.stroke();

    // Mouth
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, r * 0.38, r * 0.22, 0.2, Math.PI - 0.2);
    ctx.stroke();

    ctx.restore();
  };

  // JPG
  let dUrl = await renderCanvasToBuffer(400, 400, `
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('SnapSignFit JPG', 40, 200);
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sample.jpg'));

  // PNG
  dUrl = await renderCanvasToBuffer(400, 400, `
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('SnapSignFit PNG', 40, 200);
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sample.png'));

  // WebP
  dUrl = await renderCanvasToBuffer(400, 400, `
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('SnapSignFit WebP', 40, 200);
  `, 'image/webp');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sample.webp'));

  // Renamed files (JPG with .png extension & vice versa)
  fs.copyFileSync(path.join(FIXTURES_DIR, 'sample.jpg'), path.join(FIXTURES_DIR, 'jpg_renamed.png'));
  fs.copyFileSync(path.join(FIXTURES_DIR, 'sample.png'), path.join(FIXTURES_DIR, 'png_renamed.jpg'));
  console.log('Saved: jpg_renamed.png and png_renamed.jpg');

  // SVG
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="#f43f5e"/>
    <circle cx="200" cy="200" r="100" fill="#ffffff"/>
    <text x="200" y="210" font-size="28" text-anchor="middle" fill="#000000">SVG Sample</text>
  </svg>`;
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sample.svg'), svgContent, 'utf8');
  console.log('Saved: sample.svg');

  // BMP (Standard 54-byte BMP header + RGB)
  function createBMP(width, height) {
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize;
    const buf = Buffer.alloc(fileSize);

    // Header
    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(54, 10); // Offset
    buf.writeUInt32LE(40, 14); // DIB header size
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);  // Planes
    buf.writeUInt16LE(24, 28); // 24-bit
    buf.writeUInt32LE(0, 30);  // BI_RGB
    buf.writeUInt32LE(pixelArraySize, 34);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = 54 + y * rowSize + x * 3;
        buf[offset] = 220;     // B
        buf[offset + 1] = 120; // G
        buf[offset + 2] = 40;  // R
      }
    }
    return buf;
  }
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sample.bmp'), createBMP(100, 100));
  console.log('Saved: sample.bmp');

  // TIFF (via UTIF)
  const tiffRgba = new Uint8Array(100 * 100 * 4);
  for (let i = 0; i < tiffRgba.length; i += 4) {
    tiffRgba[i] = 70;      // R
    tiffRgba[i + 1] = 180; // G
    tiffRgba[i + 2] = 220; // B
    tiffRgba[i + 3] = 255; // A
  }
  const tiffBuffer = Buffer.from(UTIF.encodeImage(tiffRgba, 100, 100));
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sample.tiff'), tiffBuffer);
  console.log('Saved: sample.tiff');

  // Minimal GIF (GIF89a)
  dUrl = await renderCanvasToBuffer(100, 100, `
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, w, h);
  `, 'image/png');
  // For GIF, we create an authentic GIF89a 1x1 buffer
  const gifBuf = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x02, 0x00, 0x02, 0x00, 0x80, 0x00, 0x00, // 2x2, color table
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff, // black, white
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, // image descriptor
    0x02, 0x02, 0x44, 0x01, 0x00, 0x3b // data + trailer
  ]);
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sample.gif'), gifBuf);
  console.log('Saved: sample.gif');

  // Mock HEIC container (ftypheic)
  const heicBuf = Buffer.alloc(32);
  heicBuf.writeUInt32BE(24, 0); // box size
  heicBuf.write('ftyp', 4);
  heicBuf.write('heic', 8);     // major brand
  heicBuf.writeUInt32BE(0, 12); // minor version
  heicBuf.write('mif1', 16);
  heicBuf.write('heic', 20);
  fs.writeFileSync(path.join(FIXTURES_DIR, 'sample_heic.heic'), heicBuf);
  console.log('Saved: sample_heic.heic');

  // --- 2. Photo Test Fixtures ---
  console.log('\n--- Generating Photo fixtures ---');

  // A. Centered face
  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    // Draw face
    ctx.translate(w/2, h/2);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 120, 160, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-45, -30, 14, 0, Math.PI * 2);
    ctx.arc(45, -30, 14, 0, Math.PI * 2);
    ctx.fill();
    // Mouth
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 60, 35, 0.2, Math.PI - 0.2);
    ctx.stroke();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_centered.jpg'));

  // B. Face at edge
  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(130, 140);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 90, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-30, -20, 10, 0, Math.PI * 2);
    ctx.arc(30, -20, 10, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_edge.jpg'));

  // C. Tiny face in big image
  dUrl = await renderCanvasToBuffer(1200, 1200, `
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w/2, h/2);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-15, -10, 5, 0, Math.PI * 2);
    ctx.arc(15, -10, 5, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_tiny.jpg'));

  // D. Huge close-up
  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(180, 240, 30, 0, Math.PI * 2);
    ctx.arc(420, 240, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(300, 450, 80, 0.2, Math.PI - 0.2);
    ctx.stroke();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_closeup.jpg'));

  // E. Rotations: 90°, 180°, 270°
  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w/2, h/2);
    ctx.rotate(Math.PI / 2); // 90 deg
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-40, -25, 12, 0, Math.PI * 2);
    ctx.arc(40, -25, 12, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_rot90.jpg'));

  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w/2, h/2);
    ctx.rotate(Math.PI); // 180 deg
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-40, -25, 12, 0, Math.PI * 2);
    ctx.arc(40, -25, 12, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_rot180.jpg'));

  // F. Tilts: 10°, 25°, 40°
  for (const deg of [10, 25, 40]) {
    const url = await renderCanvasToBuffer(600, 600, `
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w/2, h/2);
      ctx.rotate((${deg} * Math.PI) / 180);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 110, 150, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-40, -25, 12, 0, Math.PI * 2);
      ctx.arc(40, -25, 12, 0, Math.PI * 2);
      ctx.fill();
    `, 'image/jpeg');
    saveBase64(url, path.join(FIXTURES_DIR, `face_tilted${deg}.jpg`));
  }

  // G. Low-light / dark photo
  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w/2, h/2);
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-40, -25, 12, 0, Math.PI * 2);
    ctx.arc(40, -25, 12, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_dark.jpg'));

  // H. Transparent PNG portrait
  dUrl = await renderCanvasToBuffer(600, 600, `
    ctx.translate(w/2, h/2);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-40, -25, 12, 0, Math.PI * 2);
    ctx.arc(40, -25, 12, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_trans.png'));

  // I. Small 200x200 source
  dUrl = await renderCanvasToBuffer(200, 200, `
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w/2, h/2);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 45, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-18, -12, 6, 0, Math.PI * 2);
    ctx.arc(18, -12, 6, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_200x200.jpg'));

  // J. Two faces
  dUrl = await renderCanvasToBuffer(800, 500, `
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, w, h);
    // Face 1: Large primary face
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(320, 250, 120, 160, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(280, 220, 14, 0, Math.PI * 2);
    ctx.arc(360, 220, 14, 0, Math.PI * 2);
    ctx.fill();

    // Face 2: Smaller secondary face
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.ellipse(620, 280, 70, 95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(595, 260, 8, 0, Math.PI * 2);
    ctx.arc(645, 260, 8, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'face_two.jpg'));

  // K. No face (scenery / abstract texture)
  dUrl = await renderCanvasToBuffer(600, 400, `
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#06b6d4');
    grad.addColorStop(1, '#3b82f6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(150, 120, 60, 0, Math.PI * 2);
    ctx.fill();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'no_face.jpg'));

  // --- 3. Signature Test Fixtures ---
  console.log('\n--- Generating Signature fixtures ---');

  // A. Black on white
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Draw cursive signature
    ctx.beginPath();
    ctx.moveTo(100, 120);
    ctx.bezierCurveTo(150, 40, 180, 160, 240, 90);
    ctx.bezierCurveTo(270, 50, 310, 130, 380, 100);
    ctx.bezierCurveTo(420, 80, 450, 120, 500, 110);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_black_white.png'));

  // B. Blue ink
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(120, 130);
    ctx.bezierCurveTo(180, 50, 220, 170, 280, 100);
    ctx.bezierCurveTo(320, 60, 380, 140, 460, 110);
    ctx.stroke();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_blue.jpg'));

  // C. Phone photo with shadow gradient
  dUrl = await renderCanvasToBuffer(600, 250, `
    // Diagonal shadow background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#fefce8');
    grad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Signature
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, 150);
    ctx.bezierCurveTo(160, 70, 210, 190, 270, 120);
    ctx.bezierCurveTo(320, 80, 370, 160, 450, 130);
    ctx.stroke();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_phone_shadow.jpg'));

  // D. Transparent PNG signature
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(100, 120);
    ctx.bezierCurveTo(150, 50, 220, 160, 300, 90);
    ctx.bezierCurveTo(350, 60, 400, 140, 480, 110);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_transparent.png'));

  // E. White on black (inverted)
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, 120);
    ctx.bezierCurveTo(160, 50, 220, 160, 300, 90);
    ctx.bezierCurveTo(350, 60, 420, 140, 500, 110);
    ctx.stroke();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_inverted.jpg'));

  // F. Faint thin stroke
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(100, 120);
    ctx.bezierCurveTo(160, 50, 220, 160, 300, 90);
    ctx.stroke();
  `, 'image/jpeg');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_faint.jpg'));

  // G. Signature with underline
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.bezierCurveTo(160, 40, 220, 140, 300, 80);
    ctx.bezierCurveTo(350, 50, 420, 120, 480, 90);
    ctx.stroke();
    // Straight horizontal underline
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(90, 135);
    ctx.lineTo(490, 135);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_with_underline.png'));

  // H. Signature with page border
  dUrl = await renderCanvasToBuffer(600, 250, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#334155';
    // Page border line spanning > 60%
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 20, 540, 210);

    // Signature inside
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(120, 130);
    ctx.bezierCurveTo(180, 60, 240, 160, 320, 100);
    ctx.bezierCurveTo(380, 70, 440, 140, 480, 120);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_with_border.png'));

  // I. Very wide signature
  dUrl = await renderCanvasToBuffer(800, 120, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(50, 60);
    ctx.bezierCurveTo(200, 20, 400, 100, 600, 40);
    ctx.lineTo(750, 60);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_wide.png'));

  // J. Very tall signature (h/w > 1.6)
  dUrl = await renderCanvasToBuffer(150, 450, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(75, 40);
    ctx.bezierCurveTo(20, 140, 130, 240, 75, 340);
    ctx.lineTo(75, 410);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_tall.png'));

  // K. Tilted paper with underline (8°)
  dUrl = await renderCanvasToBuffer(600, 250, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate((8 * Math.PI) / 180);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-180, -20);
    ctx.bezierCurveTo(-120, -70, -60, 20, 20, -30);
    ctx.bezierCurveTo(60, -50, 120, 10, 180, -10);
    ctx.stroke();
    // Ruled line
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-200, 25);
    ctx.lineTo(200, 25);
    ctx.stroke();
    ctx.restore();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_tilted_underline.png'));

  // L. Natural slanted handwriting (slanted text, no straight underline)
  dUrl = await renderCanvasToBuffer(600, 200, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    // Slanted letters
    for (let x = 120; x < 480; x += 45) {
      ctx.moveTo(x, 130);
      ctx.lineTo(x + 18, 70);
    }
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_slanted.png'));

  // M. Tiny signature
  dUrl = await renderCanvasToBuffer(120, 50, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, 30);
    ctx.lineTo(50, 15);
    ctx.lineTo(80, 35);
    ctx.lineTo(105, 25);
    ctx.stroke();
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_tiny.png'));

  // N. Blank page
  dUrl = await renderCanvasToBuffer(400, 200, `
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'sig_blank.png'));

  // --- 4. Stress and high-detail noise image ---
  console.log('\n--- Generating high-detail noise and huge photo ---');
  dUrl = await renderCanvasToBuffer(800, 800, `
    // Fill with high-frequency noise & colorful pattern
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const r = Math.floor(Math.sin(x * 0.1) * 127 + 128);
        const g = Math.floor(Math.cos(y * 0.1) * 127 + 128);
        const b = Math.floor((Math.sin(x * y * 0.001) * 127 + 128));
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(x, y, 4, 4);
      }
    }
  `, 'image/png');
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'noisy_high_detail.png'));

  // Huge 4000x4000 photo (scaled or mocked in browser)
  dUrl = await renderCanvasToBuffer(2048, 2048, `
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText('Large 4K Photo', 400, 1000);
  `, 'image/jpeg', 0.85);
  saveBase64(dUrl, path.join(FIXTURES_DIR, 'huge_photo.jpg'));

  await browser.close();
  console.log('\nAll fixtures generated successfully!');
}

generateAllFixtures().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
