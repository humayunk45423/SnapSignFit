// js/smartcrop.js - Saliency crop, face-aware general image/avatar crop, and fit modes (Cover/Contain/Stretch)
import { createCanvas, stepDownDownscale } from './loader.js';

/**
 * Sobel gradient energy + local color contrast on downscaled thumbnail (<= 256px)
 */
function computeSaliencyMap(canvas) {
  const maxDim = 256;
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const sw = Math.max(16, Math.round(canvas.width * scale));
  const sh = Math.max(16, Math.round(canvas.height * scale));

  const thumb = createCanvas(sw, sh);
  const tCtx = thumb.getContext('2d', { willReadFrequently: true });
  tCtx.drawImage(canvas, 0, 0, sw, sh);
  const data = tCtx.getImageData(0, 0, sw, sh).data;

  // Compute luma & saturation
  const luma = new Float32Array(sw * sh);
  const sat = new Float32Array(sw * sh);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luma[j] = 0.299 * r + 0.587 * g + 0.114 * b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sat[j] = max === 0 ? 0 : (max - min) / 255;
  }

  // Sobel 3x3 filter
  const energy = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = y * sw + x;

      // Sobel X
      const gx =
        -1 * luma[(y - 1) * sw + (x - 1)] + 1 * luma[(y - 1) * sw + (x + 1)] +
        -2 * luma[y * sw + (x - 1)]       + 2 * luma[y * sw + (x + 1)] +
        -1 * luma[(y + 1) * sw + (x - 1)] + 1 * luma[(y + 1) * sw + (x + 1)];

      // Sobel Y
      const gy =
        -1 * luma[(y - 1) * sw + (x - 1)] - 2 * luma[(y - 1) * sw + x] - 1 * luma[(y - 1) * sw + (x + 1)] +
         1 * luma[(y + 1) * sw + (x - 1)] + 2 * luma[(y + 1) * sw + x] + 1 * luma[(y + 1) * sw + (x + 1)];

      const grad = Math.hypot(gx, gy);
      energy[idx] = grad * (1 + sat[idx] * 0.5);
    }
  }

  return { energy, sw, sh, scale };
}

/**
 * Slide target aspect window across multi-scales (100% down to 70%)
 * to find the crop rectangle that maximizes saliency with center bias
 */
export function computeSaliencyCrop(canvas, targetW, targetH) {
  const { energy, sw, sh, scale } = computeSaliencyMap(canvas);
  const targetAspect = targetW / targetH;

  // Integral image for fast O(1) rectangle sum
  const integral = new Float64Array((sw + 1) * (sh + 1));
  const intW = sw + 1;

  for (let y = 0; y < sh; y++) {
    let rowSum = 0;
    for (let x = 0; x < sw; x++) {
      rowSum += energy[y * sw + x];
      integral[(y + 1) * intW + (x + 1)] = integral[y * intW + (x + 1)] + rowSum;
    }
  }

  function getRectSum(x1, y1, x2, y2) {
    const rx1 = Math.max(0, Math.min(sw, Math.round(x1)));
    const ry1 = Math.max(0, Math.min(sh, Math.round(y1)));
    const rx2 = Math.max(0, Math.min(sw, Math.round(x2)));
    const ry2 = Math.max(0, Math.min(sh, Math.round(y2)));
    return (
      integral[ry2 * intW + rx2] -
      integral[ry1 * intW + rx2] -
      integral[ry2 * intW + rx1] +
      integral[ry1 * intW + rx1]
    );
  }

  let bestScore = -1;
  let bestRect = null;
  const scales = [1.0, 0.9, 0.8, 0.7];

  for (const s of scales) {
    let winW, winH;
    if (sw / sh > targetAspect) {
      winH = Math.round(sh * s);
      winW = Math.round(winH * targetAspect);
    } else {
      winW = Math.round(sw * s);
      winH = Math.round(winW / targetAspect);
    }

    if (winW > sw || winH > sh || winW < 8 || winH < 8) continue;

    const stepX = Math.max(1, Math.floor((sw - winW) / 12));
    const stepY = Math.max(1, Math.floor((sh - winH) / 12));

    for (let y = 0; y <= sh - winH; y += stepY) {
      for (let x = 0; x <= sw - winW; x += stepX) {
        const sum = getRectSum(x, y, x + winW, y + winH);
        const winArea = winW * winH;
        const avgEnergy = sum / winArea;

        // Mild center-bias: favor windows closer to image center
        const cx = x + winW / 2;
        const cy = y + winH / 2;
        const distFromCenter = Math.hypot((cx - sw / 2) / sw, (cy - sh / 2) / sh);
        const centerBias = 1.0 - distFromCenter * 0.15;

        const score = avgEnergy * centerBias;

        if (score > bestScore) {
          bestScore = score;
          bestRect = { x, y, w: winW, h: winH };
        }
      }
    }
  }

  // Fallback to center crop if saliency is flat
  if (!bestRect) {
    if (canvas.width / canvas.height > targetAspect) {
      const h = canvas.height;
      const w = Math.round(h * targetAspect);
      return { x: Math.round((canvas.width - w) / 2), y: 0, w, h };
    } else {
      const w = canvas.width;
      const h = Math.round(w / targetAspect);
      return { x: 0, y: Math.round((canvas.height - h) / 2), w, h };
    }
  }

  // Map back to original full canvas coordinates
  return {
    x: Math.round(bestRect.x / scale),
    y: Math.round(bestRect.y / scale),
    w: Math.round(bestRect.w / scale),
    h: Math.round(bestRect.h / scale)
  };
}

/**
 * Compute face-aware crop for general images & avatars (§9)
 */
export function computeFaceAwareCrop(faces, imgW, imgH, targetW, targetH, kind = 'image') {
  const targetAspect = targetW / targetH;

  if (kind === 'avatar' && faces.length > 0) {
    // Avatar = face height ≈ 50% of crop, centered
    const f = faces[0];
    const cropH = f.box.h / 0.5;
    const cropW = cropH * targetAspect;
    const cx = f.box.x + f.box.w / 2;
    const cy = f.box.y + f.box.h / 2;

    let x = cx - cropW / 2;
    let y = cy - cropH / 2;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + cropW > imgW) x = imgW - cropW;
    if (y + cropH > imgH) y = imgH - cropH;

    return {
      x: Math.round(Math.max(0, x)),
      y: Math.round(Math.max(0, y)),
      w: Math.round(Math.min(imgW, cropW)),
      h: Math.round(Math.min(imgH, cropH))
    };
  }

  // Union of all faces with headroom
  let minX = faces[0].box.x;
  let maxX = faces[0].box.x + faces[0].box.w;
  let minY = faces[0].box.y;
  let maxY = faces[0].box.y + faces[0].box.h;

  for (let i = 1; i < faces.length; i++) {
    const b = faces[i].box;
    if (b.x < minX) minX = b.x;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y < minY) minY = b.y;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }

  const unionW = maxX - minX;
  const unionH = maxY - minY;
  const cx = minX + unionW / 2;
  const cy = minY + unionH / 2;

  // Rule of thirds placement or centered for wide banners, headroom above faces
  let cropH = unionH * 2.0;
  let cropW = cropH * targetAspect;

  if (cropW < unionW * 1.4) {
    cropW = unionW * 1.4;
    cropH = cropW / targetAspect;
  }

  if (cropW > imgW || cropH > imgH) {
    const scale = Math.min(imgW / cropW, imgH / cropH);
    cropW *= scale;
    cropH *= scale;
  }

  let x = cx - cropW / 2;
  // Shift slightly down so faces are near upper third
  let y = cy - cropH * 0.40;

  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + cropW > imgW) x = imgW - cropW;
  if (y + cropH > imgH) y = imgH - cropH;

  return {
    x: Math.round(Math.max(0, x)),
    y: Math.round(Math.max(0, y)),
    w: Math.round(Math.min(imgW, cropW)),
    h: Math.round(Math.min(imgH, cropH))
  };
}

/**
 * Render image with chosen fit mode: 'cover' | 'contain' | 'stretch'
 * 
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} targetW
 * @param {number} targetH
 * @param {Object} options
 * @param {string} [options.fit='cover']
 * @param {Object} [options.cropRect=null]
 * @param {string} [options.bgColor='#ffffff']
 * @param {boolean} [options.blurredBg=false]
 * @param {boolean} [options.transparent=false]
 */
export function renderFitMode(sourceCanvas, targetW, targetH, options = {}) {
  const {
    fit = 'cover',
    cropRect = null,
    bgColor = '#ffffff',
    blurredBg = false,
    transparent = false
  } = options;

  const out = createCanvas(targetW, targetH);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (!transparent) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, targetW, targetH);
  }

  if (fit === 'stretch') {
    // Stretch to exact target dimensions
    ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
    return out;
  }

  if (fit === 'contain') {
    if (blurredBg) {
      // Draw blurred stretched copy in background
      ctx.save();
      ctx.filter = 'blur(16px)';
      ctx.drawImage(sourceCanvas, -10, -10, targetW + 20, targetH + 20);
      ctx.restore();
    }

    const scale = Math.min(targetW / sourceCanvas.width, targetH / sourceCanvas.height);
    const dw = Math.round(sourceCanvas.width * scale);
    const dh = Math.round(sourceCanvas.height * scale);
    const dx = Math.round((targetW - dw) / 2);
    const dy = Math.round((targetH - dh) / 2);

    ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
    return out;
  }

  // Fit = 'cover' (with specified cropRect or center crop)
  const rect = cropRect || {
    x: 0,
    y: 0,
    w: sourceCanvas.width,
    h: sourceCanvas.height
  };

  const cropCanvas = createCanvas(rect.w, rect.h);
  const cCtx = cropCanvas.getContext('2d');
  cCtx.drawImage(
    sourceCanvas,
    rect.x, rect.y, rect.w, rect.h,
    0, 0, rect.w, rect.h
  );

  const downscaled = (rect.w > targetW * 1.5 || rect.h > targetH * 1.5)
    ? stepDownDownscale(cropCanvas, targetW, targetH)
    : cropCanvas;

  ctx.drawImage(downscaled, 0, 0, targetW, targetH);
  return out;
}
