const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body><canvas id="c"></canvas></body></html>');

  const dUrl = await page.evaluate(() => {
    const c = document.getElementById('c');
    c.width = 900;
    c.height = 600;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 900, 600);

    const drawPerson = (cx, cy, r) => {
      ctx.save();
      ctx.translate(cx, cy);
      // Face
      ctx.fillStyle = '#fde68a';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.75, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eyes
      const ex = r * 0.32;
      const ey = -r * 0.18;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-ex, ey, r * 0.12, 0, Math.PI * 2);
      ctx.arc(ex, ey, r * 0.12, 0, Math.PI * 2);
      ctx.fill();

      // Eyebrows
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-ex - 12, ey - 15);
      ctx.lineTo(-ex + 12, ey - 15);
      ctx.moveTo(ex - 12, ey - 15);
      ctx.lineTo(ex + 12, ey - 15);
      ctx.stroke();

      // Nose
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.05);
      ctx.lineTo(r * 0.1, r * 0.15);
      ctx.lineTo(-r * 0.08, r * 0.18);
      ctx.stroke();

      // Mouth
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, r * 0.38, r * 0.25, 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.restore();
    };

    // Primary face (larger)
    drawPerson(320, 300, 150);
    // Secondary face
    drawPerson(680, 300, 130);

    return c.toDataURL('image/jpeg', 0.95);
  });

  const base64 = dUrl.split(',')[1];
  fs.writeFileSync('./tests/fixtures/face_two.jpg', Buffer.from(base64, 'base64'));
  console.log('Regenerated face_two.jpg with two complete detailed faces');
  await browser.close();
})();
