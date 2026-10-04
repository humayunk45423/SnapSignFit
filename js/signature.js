// js/signature.js - Pure JavaScript signature extraction, illumination flattening, ink segmentation, and padding fit
import { createCanvas, stepDownDownscale } from './loader.js';

/**
 * Fast separable box blur for illumination background estimation
 */
function boxBlur1D(src, dst, w, h, radius) {
  const scale = 1 / (radius + radius + 1);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    let sum = 0;
    const firstVal = src[rowOffset];
    const lastVal = src[rowOffset + w - 1];

    for (let i = -radius; i <= radius; i++) {
      const idx = Math.min(Math.max(i, 0), w - 1);
      sum += src[rowOffset + idx];
    }

    for (let x = 0; x < w; x++) {
      dst[rowOffset + x] = sum * scale;
      const leftIdx = Math.max(x - radius, 0);
      const rightIdx = Math.min(x + radius + 1, w - 1);
      sum += src[rowOffset + rightIdx] - src[rowOffset + leftIdx];
    }
  }
}

function boxBlur2D(gray, w, h, radius) {
  const temp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  boxBlur1D(gray, temp, w, h, radius);

  // Transpose blur vertically
  const scale = 1 / (radius + radius + 1);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const idx = Math.min(Math.max(i, 0), h - 1);
      sum += temp[idx * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * scale;
      const topIdx = Math.max(y - radius, 0);
      const bottomIdx = Math.min(y + radius + 1, h - 1);
      sum += temp[bottomIdx * w + x] - temp[topIdx * w + x];
    }
  }
  return out;
}

/**
 * Otsu's thresholding method on 0..255 normalized data
 */
function otsuThreshold(norm, w, h, marginX, marginY) {
  const hist = new Uint32Array(256);
  let count = 0;

  for (let y = marginY; y < h - marginY; y++) {
    const row = y * w;
    for (let x = marginX; x < w - marginX; x++) {
      hist[Math.round(norm[row + x])]++;
      count++;
    }
  }

  if (count === 0) return 128;

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = count - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Disjoint Set Union (Union-Find) for connected components
 */
class UnionFind {
  constructor(size) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }
  find(i) {
    let root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }
  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootJ] = rootI;
    }
  }
}

/**
 * Extract connected components from binary mask
 */
function getConnectedComponents(mask, w, h) {
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const uf = new UnionFind(Math.floor((w * h) / 4) + 100);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx]) continue;

      const up = y > 0 ? labels[(y - 1) * w + x] : 0;
      const left = x > 0 ? labels[y * w + (x - 1)] : 0;

      if (up === 0 && left === 0) {
        labels[idx] = nextLabel++;
      } else if (up !== 0 && left === 0) {
        labels[idx] = up;
      } else if (up === 0 && left !== 0) {
        labels[idx] = left;
      } else {
        labels[idx] = up;
        if (up !== left) {
          uf.union(up, left);
        }
      }
    }
  }

  // Aggregate components
  const compMap = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const l = labels[idx];
      if (l === 0) continue;
      const root = uf.find(l);
      let comp = compMap.get(root);
      if (!comp) {
        comp = { minX: x, maxX: x, minY: y, maxY: y, count: 0, points: [] };
        compMap.set(root, comp);
      }
      comp.count++;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;
      if (comp.points.length < 500) {
        comp.points.push({ x, y });
      }
    }
  }

  const components = [];
  for (const c of compMap.values()) {
    c.w = c.maxX - c.minX + 1;
    c.h = c.maxY - c.minY + 1;
    components.push(c);
  }
  return { components, labels, uf };
}

/**
 * Dilate ink mask for "thicken strokes" feature
 */
function dilateMask(mask, w, h, radius) {
  if (radius <= 0) return mask;
  const r = Math.round(radius);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Classifies an image as 'photo' vs 'signature' based on color entropy, skin tones,
 * background luminance distribution, and ink connected components.
 */
export function classifyImageContent(canvas) {
  if (!canvas) return 'photo';
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const total = w * h;

  let sumRg = 0, sumYb = 0, sumRgSq = 0, sumYbSq = 0;
  let skinToneCount = 0;
  let highSatCount = 0;
  let brightPaperCount = 0;
  let darkInkCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma > 175) brightPaperCount++;
    else if (luma < 110) darkInkCount++;

    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRg += rg;
    sumYb += yb;
    sumRgSq += rg * rg;
    sumYbSq += yb * yb;

    // Skin tone heuristic in RGB
    if (r > g && g > b && (r - g) > 12 && (r - b) > 18 && r > 75 && b < 185) {
      skinToneCount++;
    }

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat > 0.32 && max > 50) highSatCount++;
  }

  const meanRg = sumRg / total;
  const meanYb = sumYb / total;
  const stdRg = Math.sqrt(Math.max(0, sumRgSq / total - meanRg * meanRg));
  const stdYb = Math.sqrt(Math.max(0, sumYbSq / total - meanYb * meanYb));
  const colorfulness = Math.sqrt(stdRg * stdRg + stdYb * stdYb) + 0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb);

  const skinRatio = skinToneCount / total;
  const satRatio = highSatCount / total;
  const paperRatio = brightPaperCount / total;
  const inkRatio = darkInkCount / total;
  const aspect = w / h;

  // If there are skin tones or rich colorfulness -> definitely a Photo
  if (skinRatio > 0.08 || (colorfulness > 26 && satRatio > 0.15)) {
    return 'photo';
  }

  // If wide aspect and mostly monochromatic -> Signature
  if (aspect >= 2.0 && colorfulness < 24) {
    return 'signature';
  }

  // If mostly bright background with sparse ink strokes -> Signature
  if (paperRatio > 0.60 && inkRatio > 0.002 && inkRatio < 0.25 && colorfulness < 22 && skinRatio < 0.03) {
    return 'signature';
  }

  return 'photo';
}

/**
 * Main signature analysis & extraction function
 * Follows all 11 steps of §8
 * 
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {Object} options
 * @param {boolean} [options.keepInkColor=false]
 * @param {number} [options.thickenPx=0]
 * @param {boolean} [options.useFullImage=false]
 * @param {boolean} [options.transparent=false]
 * @param {string} [options.bgColor='#ffffff']
 */
export function processSignature(sourceCanvas, targetW, targetH, options = {}) {
  const {
    keepInkColor = false,
    thickenPx = 0,
    useFullImage = false,
    transparent = false,
    bgColor = '#ffffff'
  } = options;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = imgData.data;

  // Step 1: Grayscale (luma) and Min(R,G,B) channel, pick higher contrast
  const gray = new Float32Array(w * h);
  const minRGB = new Float32Array(w * h);
  let sumLuma = 0, sumMin = 0;

  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    const luma = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    const m = Math.min(src[i], src[i + 1], src[i + 2]);
    gray[j] = luma;
    minRGB[j] = m;
    sumLuma += luma;
    sumMin += m;
  }

  // Use channel with better dynamic contrast (lower mean darkness)
  const activeGray = (sumMin / (w * h) < sumLuma / (w * h) * 0.9) ? minRGB : gray;

  // Step 2: Illumination correction with large-radius box blur (~5% of longest side)
  const blurRadius = Math.max(8, Math.round(Math.max(w, h) * 0.05));
  const bgEstimate = boxBlur2D(activeGray, w, h, blurRadius);

  const norm = new Float32Array(w * h);
  for (let i = 0; i < norm.length; i++) {
    const bgVal = Math.max(1, bgEstimate[i]);
    const val = (activeGray[i] / bgVal) * 255;
    norm[i] = Math.max(0, Math.min(255, val));
  }

  // Step 3: Polarity check: if median(norm) < 110, invert
  const sampleValues = [];
  const step = Math.max(1, Math.floor(norm.length / 2000));
  for (let i = 0; i < norm.length; i += step) {
    sampleValues.push(norm[i]);
  }
  sampleValues.sort((a, b) => a - b);
  const medianNorm = sampleValues[Math.floor(sampleValues.length / 2)] || 128;
  const isInverted = medianNorm < 110;

  if (isInverted) {
    for (let i = 0; i < norm.length; i++) {
      norm[i] = 255 - norm[i];
    }
  }

  // Step 5: Ignore 2% margin on all edges
  const marginX = Math.round(w * 0.02);
  const marginY = Math.round(h * 0.02);

  // Step 4: Otsu thresholding
  let threshold = otsuThreshold(norm, w, h, marginX, marginY);

  // Initial ink mask (ink pixels are darker than background, so norm < threshold)
  let mask = new Uint8Array(w * h);
  let inkCount = 0;
  const analysisCount = (w - marginX * 2) * (h - marginY * 2);

  for (let y = marginY; y < h - marginY; y++) {
    const row = y * w;
    for (let x = marginX; x < w - marginX; x++) {
      if (norm[row + x] < threshold) {
        mask[row + x] = 1;
        inkCount++;
      }
    }
  }

  let inkFraction = inkCount / Math.max(1, analysisCount);

  // Sanity check: if ink fraction > 35% or < 0.05%, retry with darkest 3%
  let warnings = [];
  if (inkFraction > 0.35 || inkFraction < 0.0005) {
    sampleValues.sort((a, b) => a - b);
    const p3Index = Math.floor(sampleValues.length * 0.03);
    threshold = sampleValues[p3Index] || 50;

    mask = new Uint8Array(w * h);
    inkCount = 0;
    for (let y = marginY; y < h - marginY; y++) {
      const row = y * w;
      for (let x = marginX; x < w - marginX; x++) {
        if (norm[row + x] < threshold) {
          mask[row + x] = 1;
          inkCount++;
        }
      }
    }
    inkFraction = inkCount / Math.max(1, analysisCount);
  }

  if (inkFraction < 0.0002) {
    // Blank page or no signature found
    const outCanvas = createCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
    if (w > 0 && h > 0 && sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const scale = Math.min(targetW / w, targetH / h);
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      outCtx.drawImage(sourceCanvas, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
    }

    return {
      success: false,
      warning: 'warnNoSignature',
      bbox: { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) },
      components: [],
      canvas: outCanvas,
      inkAspect: 1.0
    };
  }

  // Step 6: Connected components denoise
  const { components, labels, uf } = getConnectedComponents(mask, w, h);
  const totalArea = w * h;

  // Identify large components to protect nearby i-dots / periods
  const largeComps = components.filter(c => c.count > totalArea * 0.0005);

  const keptMask = new Uint8Array(w * h);
  const keptComponents = [];

  for (const c of components) {
    // Rule A: Drop long straight border/ruled components spanning > 60% of image width
    if (c.w > w * 0.60 && c.h < h * 0.12) {
      continue;
    }

    // Rule B: Specks smaller than 0.02% of area
    if (c.count < totalArea * 0.0002) {
      // Keep if close to a large component (i-dots, accents, periods)
      let closeToLarge = false;
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      for (const lc of largeComps) {
        const lcx = (lc.minX + lc.maxX) / 2;
        const lcy = (lc.minY + lc.maxY) / 2;
        if (Math.hypot(cx - lcx, cy - lcy) < Math.max(lc.w, lc.h) * 0.8) {
          closeToLarge = true;
          break;
        }
      }
      if (!closeToLarge) continue;
    }

    keptComponents.push(c);
  }

  // Populate keptMask
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const l = labels[idx];
      if (l === 0) continue;
      const root = uf.find(l);
      if (keptComponents.some(kc => kc.minX <= x && kc.maxX >= x && kc.minY <= y && kc.maxY >= y)) {
        keptMask[idx] = 1;
      }
    }
  }

  // Step 7: Bounding box from 0.5–99.5 percentile of ink coordinates + margin
  let inkXs = [];
  let inkYs = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (keptMask[y * w + x]) {
        inkXs.push(x);
        inkYs.push(y);
      }
    }
  }

  if (inkXs.length === 0) {
    const outCanvas = createCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
    if (w > 0 && h > 0 && sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      const scale = Math.min(targetW / w, targetH / h);
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      outCtx.drawImage(sourceCanvas, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
    }
    return {
      success: false,
      warning: 'warnNoSignature',
      bbox: { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) },
      components: [],
      canvas: outCanvas,
      inkAspect: 1.0
    };
  }

  inkXs.sort((a, b) => a - b);
  inkYs.sort((a, b) => a - b);

  let minX = inkXs[Math.floor(inkXs.length * 0.005)];
  let maxX = inkXs[Math.floor(inkXs.length * 0.995)];
  let minY = inkYs[Math.floor(inkYs.length * 0.005)];
  let maxY = inkYs[Math.floor(inkYs.length * 0.995)];

  const boxH = Math.max(1, maxY - minY + 1);
  const margin = Math.max(2, Math.round(boxH * 0.06));

  let cropX = Math.max(0, minX - margin);
  let cropY = Math.max(0, minY - margin);
  let cropW = Math.min(w - cropX, (maxX - minX + 1) + margin * 2);
  let cropH = Math.min(h - cropY, boxH + margin * 2);

  if (useFullImage) {
    cropX = 0;
    cropY = 0;
    cropW = w;
    cropH = h;
  }

  // Aspect ratio check for extreme aspect warnings & rotation
  const inkAspect = cropH / Math.max(1, cropW);
  if (inkAspect > 3.0 || inkAspect < 0.1) {
    warnings.push('warnExtremeAspect');
  }

  // Stroke thickening dilation if slider > 0
  let finalMask = keptMask;
  if (thickenPx > 0) {
    finalMask = dilateMask(keptMask, w, h, thickenPx);
  }

  // Safety: if crop region is zero, return fallback
  if (cropW <= 0 || cropH <= 0) {
    const outCanvas = createCanvas(targetW, targetH);
    const outCtx = outCanvas.getContext('2d');
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
    return {
      success: false,
      warning: 'warnNoSignature',
      bbox: { x: 0, y: 0, w: Math.max(1, w), h: Math.max(1, h) },
      components: [],
      canvas: outCanvas,
      inkAspect: 1.0
    };
  }

  // Step 8: Smooth composition
  // Alpha from norm: alpha = 1 - norm/255, contrast-stretched, gamma 0.8
  const patchCanvas = createCanvas(Math.max(1, cropW), Math.max(1, cropH));
  const patchCtx = patchCanvas.getContext('2d');
  const patchImg = patchCtx.createImageData(Math.max(1, cropW), Math.max(1, cropH));
  const pData = patchImg.data;

  for (let py = 0; py < cropH; py++) {
    const sy = cropY + py;
    for (let px = 0; px < cropW; px++) {
      const sx = cropX + px;
      const sIdx = sy * w + sx;
      const pIdx = (py * cropW + px) * 4;

      if (!finalMask[sIdx]) {
        // Transparent in patch
        pData[pIdx] = 0;
        pData[pIdx + 1] = 0;
        pData[pIdx + 2] = 0;
        pData[pIdx + 3] = 0;
        continue;
      }

      // Compute smooth antialiased alpha
      let alpha = 1.0 - (norm[sIdx] / 255);
      alpha = Math.max(0, Math.min(1, (alpha - 0.15) / 0.70));
      alpha = Math.pow(alpha, 0.8);

      if (keepInkColor) {
        pData[pIdx] = src[sIdx * 4];
        pData[pIdx + 1] = src[sIdx * 4 + 1];
        pData[pIdx + 2] = src[sIdx * 4 + 2];
      } else {
        // Clean near-black (#111111)
        pData[pIdx] = 17;
        pData[pIdx + 1] = 17;
        pData[pIdx + 2] = 17;
      }
      pData[pIdx + 3] = Math.round(alpha * 255);
    }
  }

  patchCtx.putImageData(patchImg, 0, 0);

  // Step 9: Fit inside target with ~4% padding, preserving aspect ratio. NEVER stretch!
  const padW = targetW * 0.04;
  const padH = targetH * 0.04;
  const availW = targetW - padW * 2;
  const availH = targetH - padH * 2;

  const scale = Math.min(availW / Math.max(1, cropW), availH / Math.max(1, cropH));
  const destW = Math.max(1, Math.round(cropW * scale));
  const destH = Math.max(1, Math.round(cropH * scale));
  const destX = Math.round((targetW - destW) / 2);
  const destY = Math.round((targetH - destH) / 2);

  const outCanvas = createCanvas(targetW, targetH);
  const outCtx = outCanvas.getContext('2d');

  if (!transparent) {
    outCtx.fillStyle = bgColor;
    outCtx.fillRect(0, 0, targetW, targetH);
  }

  // Downscale smooth rendering
  const downscaledPatch = (cropW > destW * 1.5)
    ? stepDownDownscale(patchCanvas, destW, destH)
    : patchCanvas;

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  if (downscaledPatch && downscaledPatch.width > 0 && downscaledPatch.height > 0 && destW > 0 && destH > 0) {
    outCtx.drawImage(downscaledPatch, destX, destY, destW, destH);
  }

  // Check if stroke too thin at destination
  if (scale < 0.25) {
    warnings.push('warnThinInk');
  }

  return {
    success: true,
    warnings,
    bbox: { x: cropX, y: cropY, w: cropW, h: cropH },
    components: keptComponents,
    canvas: outCanvas,
    inkAspect
  };
}
